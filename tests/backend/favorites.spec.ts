import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { FavoritesService } from '../../backend/src/favorites/favorites.service';

test('QA-D02 favorite add is idempotent; listing and removal preserve the other account', async () => {
  const rows: any[] = [];
  const repo = {
    upsert: async (data: any, keys: string[]) => {
      assert.deepEqual(keys, ['userId', 'productId']);
      if (!rows.some(r => r.userId === data.userId && r.productId === data.productId)) rows.push({ id: rows.length + 1, ...data, product: { id: data.productId } });
    },
    find: async ({ where }: any) => rows.filter(r => r.userId === where.userId),
    findOne: async ({ where }: any) => rows.find(r => r.userId === where.userId && r.productId === where.productId),
    delete: async (where: any) => { const i = rows.findIndex(r => r.userId === where.userId && r.productId === where.productId); if (i >= 0) rows.splice(i, 1); },
  };
  const service = new FavoritesService(repo as never, {
    findOne: async (id: number) => { if (id !== 10) throw new NotFoundException(); return { id }; },
    publicProduct: async (product: any) => product,
  } as never);
  await service.add(1, 10); await service.add(1, 10); await service.add(2, 10);
  assert.equal(rows.length, 2); assert.equal((await service.list(1)).length, 1);
  await service.remove(1, 10); assert.deepEqual(await service.list(1), []);
  assert.equal((await service.list(2))[0].productId, 10);
  await assert.rejects(service.add(1, 999), NotFoundException); assert.equal(rows.length, 1);
});
