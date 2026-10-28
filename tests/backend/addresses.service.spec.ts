import { NotFoundException } from '@nestjs/common';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Repository } from 'typeorm';
import { UserAddress } from '../../backend/src/database/entities/user-address.entity';
import { AddressesService } from '../../backend/src/addresses/addresses.service';

test('default address changes stay inside the authenticated user', async () => {
  const rows = [
    { id: 1, userId: 1, isDefault: true, updatedAt: new Date(1) },
    { id: 2, userId: 1, isDefault: false, updatedAt: new Date(2) },
    { id: 3, userId: 2, isDefault: true, updatedAt: new Date(3) },
  ] as UserAddress[];

  let repository: any;
  repository = {
    manager: { transaction: (work: any) => work({ getRepository: () => repository }) },
    findOne: async ({ where, order }: any) => {
      const matches = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key as keyof UserAddress] === value));
      if (order?.updatedAt) matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return matches[0] ?? null;
    },
    update: async ({ userId }: { userId: number }, values: Partial<UserAddress>) => {
      rows.filter((row) => row.userId === userId).forEach((row) => Object.assign(row, values));
    },
    save: async (row: UserAddress) => row,
    remove: async (row: UserAddress) => rows.splice(rows.indexOf(row), 1),
  };

  const service = new AddressesService(repository as Repository<UserAddress>);
  await service.update(1, 2, { isDefault: true });

  assert.equal(rows.find((row) => row.id === 1)?.isDefault, false);
  assert.equal(rows.find((row) => row.id === 2)?.isDefault, true);
  assert.equal(rows.find((row) => row.id === 3)?.isDefault, true);
  await assert.rejects(() => service.update(1, 3, { fullName: 'Blocked' }), NotFoundException);

  await service.remove(1, 2);
  assert.equal(rows.find((row) => row.id === 1)?.isDefault, true);
  assert.equal(rows.find((row) => row.id === 3)?.isDefault, true);
});
