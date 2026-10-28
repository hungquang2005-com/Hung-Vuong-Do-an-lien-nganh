import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { SavePromotionDto } from '../../backend/src/promotions/promotion.dto';
import { PromotionsService } from '../../backend/src/promotions/promotions.service';
import { Promotion } from '../../backend/src/database/entities/promotion.entity';
import { Product } from '../../backend/src/database/entities/product.entity';

test('promotion DTO rejects duplicate IDs, invalid discounts, excess items and untrusted fields', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const valid = { title: 'Ưu đãi', description: '', status: 'published', startsAt: '2026-11-01T09:00:00+07:00', endsAt: '2026-11-02T09:00:00+07:00', items: [{ productId: 1, discountPercent: 35 }] };
  const check = (value: unknown) => pipe.transform(value, { type: 'body', metatype: SavePromotionDto });
  assert.equal((await check(valid)).items[0].discountPercent, 35);
  for (const items of [[valid.items[0], valid.items[0]], [{ productId: 1, discountPercent: 100 }], [{ productId: 1, discountPercent: 1.5 }], [{ productId: -1, discountPercent: 20 }], [{ productId: 1, discountPercent: 20, price: 1 }], Array.from({ length: 201 }, (_, i) => ({ productId: i + 1, discountPercent: 20 }))]) {
    await assert.rejects(check({ ...valid, items }));
  }
  await assert.rejects(check({ ...valid, status: 'active' }));
  await assert.rejects(check({ ...valid, startsAt: 'not-a-date' }));
});

test('promotion schema upgrade is additive and repeatable, preserving existing order totals', async () => {
  const { upgradePromotions } = require('../../backend/scripts/setup-promotions.cjs');
  const statements: string[] = [], orderColumns = new Set(['id', 'total_amount']);
  const columns: Record<string, string[]> = { promotions: ['id', 'title', 'description', 'status', 'starts_at', 'ends_at'], promotion_items: ['id', 'promotion_id', 'product_id', 'discount_percent'], promotion_lock: ['id'] };
  const connection = { query: async (sql: string) => {
    statements.push(sql);
    if (sql === 'SHOW COLUMNS FROM orders') return [[...orderColumns].map(Field => ({ Field }))];
    if (sql.startsWith('ALTER TABLE orders')) for (const match of sql.matchAll(/ADD COLUMN (\w+)/g)) orderColumns.add(match[1]);
    if (sql.startsWith('ALTER TABLE promotions ADD COLUMN')) columns.promotions.push('banner_discount_percent');
    if (sql.startsWith('SHOW COLUMNS FROM ')) return [(columns[sql.slice('SHOW COLUMNS FROM '.length)] ?? []).map(Field => ({ Field }))];
    if (sql === 'SHOW INDEX FROM promotion_items') return [[{ Key_name: 'UQ_promotion_product', Non_unique: 0, Column_name: 'promotion_id' }, { Key_name: 'UQ_promotion_product', Non_unique: 0, Column_name: 'product_id' }]];
    return [[]];
  } };
  await upgradePromotions(connection); await upgradePromotions(connection);
  assert.equal(statements.filter(sql => sql.startsWith('ALTER TABLE orders')).length, 1);
  assert.equal(statements.filter(sql => sql.startsWith('ALTER TABLE promotions')).length, 1);
  assert.ok(orderColumns.has('subtotal_amount')); assert.ok(orderColumns.has('discount_amount')); assert.ok(orderColumns.has('coupon_code'));
  assert.ok(!statements.some(sql => /^\s*(DELETE|UPDATE|DROP|TRUNCATE)\b/i.test(sql)));
  assert.ok(statements.some(sql => /INSERT IGNORE INTO promotion_lock/.test(sql)));
});

const futurePromotion = (): SavePromotionDto => ({ title: 'QA promotion', description: '', status: 'published',
  startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 172800000).toISOString(),
  items: [{ productId: 10, discountPercent: 20 }] });

test('QA-E02 invalid promotion dates, timezone, empty publication and exaggerated banner are rejected before writes', async () => {
  let transactions = 0;
  const service = new PromotionsService({ transaction: async () => { transactions++; throw new Error('Should not write'); } } as any);
  const base = futurePromotion();
  for (const patch of [{ title: ' ' }, { endsAt: base.startsAt }, { startsAt: 'invalid' },
    { startsAt: '2099-01-01T09:00:00', endsAt: '2099-01-02T09:00:00' },
    { items: [] }, { endsAt: '2000-01-01T00:00:00Z' }, { bannerDiscountPercent: 90 }]) {
    await assert.rejects(service.save({ ...base, ...patch }), BadRequestException);
  }
  assert.equal(transactions, 0);
});

test('QA-E03 overlap and missing products fail inside the locked promotion transaction without writes', async () => {
  let conflict = true, locks = 0, writes = 0;
  const q: any = { where: () => q, andWhere: () => q, getOne: async () => conflict ? { title: 'existing' } : null };
  const manager = { query: async (sql: string) => { assert.match(sql, /FOR UPDATE$/); locks++; return [{ id: 1 }]; },
    getRepository: (entity: any) => {
      if (entity === Promotion) return { createQueryBuilder: () => q, save: async () => { writes++; } };
      if (entity === Product) return { find: async () => [] };
      throw new Error('Unexpected write');
    } };
  const service = new PromotionsService({ transaction: async (work: any) => work(manager) } as any);
  await assert.rejects(service.save(futurePromotion()), ConflictException);
  conflict = false;
  await assert.rejects(service.save(futurePromotion()), BadRequestException);
  assert.equal(locks, 2); assert.equal(writes, 0);
});
