import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { entities } from '../../backend/src/database/entities';
import { Product } from '../../backend/src/database/entities/product.entity';
import { ProductsService } from '../../backend/src/products/products.service';

test('QA-B04 catalog search builds parameterized MySQL for hostile keyword/category without connecting', async () => {
  const source = new DataSource({ type: 'mysql', database: 'qa_metadata_only', entities });
  await (source as any).buildMetadatas();
  const repository = source.getRepository(Product);
  const create = repository.createQueryBuilder.bind(repository);
  const statements: Array<[string, any[]]> = [];
  repository.createQueryBuilder = (...args: any[]) => {
    const query = create(...args);
    query.getMany = async () => { statements.push(query.getQueryAndParameters()); return []; };
    return query;
  };
  const service = new ProductsService(repository, { prices: async () => new Map() } as never);
  const hostile = "' OR 1=1 --";
  assert.deepEqual(await service.list({ keyword: hostile, category: hostile }), []);
  assert.equal(statements.length, 1);
  const [sql, parameters] = statements[0];
  assert.equal(sql.includes(hostile), false); assert.match(sql, /LIKE \?/); assert.match(sql, /category.*= \?/);
  assert.ok(parameters.includes('%' + hostile.toLowerCase() + '%')); assert.ok(parameters.includes(hostile));
  await service.list({ keyword: '   ', category: ' ' });
  assert.equal(statements[1][1].length, 0);
});

test('QA-B05 product detail rejects missing IDs and serializes price, stock, promotion and review summary', async () => {
  const query: any = { select: () => query, addSelect: () => query, where: () => query, groupBy: () => query,
    getRawMany: async () => [] };
  const product = { id: 10, name: 'QA Kettle', price: '500000', stock: 2, isFeatured: 1 };
  const repository = { findOne: async ({ where }: any) => where.id === 10 ? product : null,
    manager: { getRepository: () => ({ createQueryBuilder: () => query }) } };
  const service = new ProductsService(repository as never, { prices: async () => new Map([[10,
    { price: 300000, originalPrice: 500000, discountPercent: 40, savings: 200000 }]]) } as never);
  await assert.rejects(service.findOne(999), NotFoundException);
  const result = await service.findOne(10);
  assert.equal(result.price, 300000); assert.equal(result.stock, 2); assert.equal(result.originalPrice, 500000);
  assert.equal(result.reviewCount, 0); assert.equal(result.isFeatured, true);
});
