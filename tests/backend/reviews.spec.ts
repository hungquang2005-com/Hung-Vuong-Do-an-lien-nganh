import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { SaveReviewDto, ListReviewsDto } from '../../backend/src/reviews/review.dto';
import { ReviewsService, reviewSummaries } from '../../backend/src/reviews/reviews.service';
import { Product } from '../../backend/src/database/entities/product.entity';
import { ProductReview } from '../../backend/src/database/entities/product-review.entity';
import { Order } from '../../backend/src/database/entities/order.entity';

test('review DTO accepts only 1–5 integer stars and rejects spoofed buyer/order IDs', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const check = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SaveReviewDto });
  assert.equal((await check({ rating: 4, comment: 'Tốt' })).rating, 4);
  for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: '5' }, { rating: 5, userId: 1 }, { rating: 5, orderId: 1 }, { rating: 5, comment: 'a'.repeat(2001) }]) await assert.rejects(check(body));
  assert.equal((await pipe.transform({}, { type: 'query', metatype: ListReviewsDto })).page, 1);
  await assert.rejects(pipe.transform({ rating: '6' }, { type: 'query', metatype: ListReviewsDto }));
  await assert.rejects(pipe.transform({ page: '0' }, { type: 'query', metatype: ListReviewsDto }));
});

test('review summaries use database counts, convert numeric strings and keep unrated products at zero', async () => {
  let queries = 0;
  const query: any = { select: () => query, addSelect: () => query, where: () => query, groupBy: () => query,
    getRawMany: async () => { queries++; return [{ productId: '1', reviewCount: '3', averageRating: '4.33333', stars1: '0', stars2: '0', stars3: '0', stars4: '2', stars5: '1' }]; } };
  const manager: any = { getRepository: () => ({ createQueryBuilder: () => query }) };
  const summaries = await reviewSummaries(manager, [1, 2]);
  assert.deepEqual(summaries.get(1), { averageRating: 4.3, reviewCount: 3, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } });
  assert.deepEqual(summaries.get(2), { averageRating: 0, reviewCount: 0, ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  await reviewSummaries(manager, []); assert.equal(queries, 1);
});

test('review migration is repeatable and never updates/deletes existing orders or customer data', async () => {
  const { upgradeReviews } = require('../../backend/scripts/setup-reviews.cjs');
  const statements: string[] = [];
  const connection = { query: async (sql: string) => {
    statements.push(sql);
    if (sql === 'SHOW COLUMNS FROM product_reviews') return [['id', 'product_id', 'user_id', 'order_id', 'rating', 'comment', 'created_at', 'updated_at'].map(Field => ({ Field }))];
    if (sql === 'SHOW INDEX FROM product_reviews') return [[{ Key_name: 'UQ_review_buyer_product', Non_unique: 0, Column_name: 'user_id' }, { Key_name: 'UQ_review_buyer_product', Non_unique: 0, Column_name: 'product_id' }]];
    return [[]];
  } };
  await upgradeReviews(connection); await upgradeReviews(connection);
  assert.ok(!statements.some(sql => /^\s*(DELETE|UPDATE|DROP|TRUNCATE)\b/i.test(sql)));
  assert.match(statements[0], /CHECK \(rating BETWEEN 1 AND 5\)/);
});

test('QA-D01 reviews require an owned delivered and paid purchase; edits keep one buyer/product row', async () => {
  const purchases: any[] = [];
  const reviews: any[] = [];
  let productExists = true;
  let locks = 0;
  const orderQuery = () => {
    let params: any = {};
    const query: any = { select: () => query, orderBy: () => query,
      innerJoin: (_relation: string, _alias: string, _condition: string, values: any) => { Object.assign(params, values); return query; },
      where: (_sql: string, values: any) => { Object.assign(params, values); return query; },
      andWhere: (_sql: string, values: any) => { Object.assign(params, values); return query; },
      setLock: () => { locks++; return query; },
      getOne: async () => purchases.find(p => p.userId === params.userId && p.productId === params.productId && p.status === params.status && p.paymentStatus === params.paid) ?? null };
    return query;
  };
  const reviewRepo = {
    findOneBy: async (where: any) => reviews.find(r => r.userId === where.userId && r.productId === where.productId) ?? null,
    upsert: async (data: any, keys: string[]) => {
      assert.deepEqual(keys, ['userId', 'productId']);
      const current = reviews.find(r => r.userId === data.userId && r.productId === data.productId);
      if (current) Object.assign(current, data); else reviews.push({ ...data });
    },
    createQueryBuilder: () => { const q: any = { select: () => q, addSelect: () => q, where: () => q, groupBy: () => q,
      getRawMany: async () => [] }; return q; },
  };
  const manager: any = { queryRunner: { isTransactionActive: false }, getRepository: (entity: any) => {
    if (entity === Product) return { findOne: async () => productExists ? { id: 10 } : null };
    if (entity === Order) return { createQueryBuilder: orderQuery };
    if (entity === ProductReview) return reviewRepo;
    throw new Error('Unexpected repository');
  } };
  const service = new ReviewsService({ manager, getRepository: manager.getRepository,
    transaction: async (work: any) => { manager.queryRunner.isTransactionActive = true;
      try { return await work(manager); } finally { manager.queryRunner.isTransactionActive = false; } } } as any);
  const valid = { id: 1, userId: 1, productId: 10, status: 'DELIVERED', paymentStatus: 'PAID' };
  for (const patch of [{ userId: 2 }, { productId: 20 }, { status: 'PENDING' }, { status: 'CANCELLED' }, { paymentStatus: 'UNPAID' }]) {
    purchases.splice(0, purchases.length, { ...valid, ...patch });
    await assert.rejects(service.save(1, 10, { rating: 5, comment: 'QA' }), ForbiddenException);
    assert.equal(reviews.length, 0);
  }
  purchases.splice(0, purchases.length, valid);
  productExists = false;
  await assert.rejects(service.save(1, 10, { rating: 5 }), NotFoundException);
  productExists = true;
  const saved = await service.save(1, 10, { rating: 5, comment: ' QA review ' });
  assert.equal(saved.canReview, true); assert.deepEqual(saved.review, { rating: 5, comment: 'QA review' });
  await service.save(1, 10, { rating: 3, comment: 'Edited' });
  assert.equal(reviews.length, 1); assert.equal(reviews[0].orderId, 1); assert.equal(reviews[0].rating, 3);
  assert.deepEqual(await service.mine(2, 10), { canReview: false, review: null });
  assert.ok(locks >= 7);
});
