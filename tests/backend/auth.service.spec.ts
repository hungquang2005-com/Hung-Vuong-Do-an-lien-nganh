import { BadRequestException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import assert from 'node:assert/strict';
import test from 'node:test';
import * as bcrypt from 'bcryptjs';
import { User, UserGender } from '../../backend/src/database/entities/user.entity';
import { AuthService } from '../../backend/src/auth/auth.service';
import { UpdateProfileDto } from '../../backend/src/auth/dto/update-profile.dto';
import { AuthController } from '../../backend/src/auth/auth.controller';

test('changePassword checks confirmation and current password before saving', async () => {
  const user = { id: 1, password: await bcrypt.hash('old-password', 4) } as User;
  let saves = 0;
  const users = {
    findOneByOrFail: async () => user,
    save: async () => { saves += 1; return user; },
  };
  const auth = new AuthService(users as never, {} as never, {} as never, {} as never, {} as never);

  await assert.rejects(() => auth.changePassword(1, 'old-password', 'new-password', 'different'), BadRequestException);
  await assert.rejects(() => auth.changePassword(1, 'wrong-password', 'new-password', 'new-password'), UnauthorizedException);
  await auth.changePassword(1, 'old-password', 'new-password', 'new-password');

  assert.equal(saves, 1);
  assert.equal(await bcrypt.compare('new-password', user.password), true);
});

test('merged profile endpoint validates fields and saves personal data without losing avatar or payment profile', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const metatype = Reflect.getMetadata('design:paramtypes', AuthController.prototype, 'updateProfile')[1];
  assert.equal(metatype, UpdateProfileDto);
  const check = (body: unknown) => pipe.transform(body, { type: 'body', metatype });
  for (const body of [{ fullName: ' ' }, { birthDate: 'invalid' }, { gender: 'invalid' }, { address: 123 }, { role: 'ADMIN' }, { cardHolder: 'spoofed' }]) {
    await assert.rejects(check(body), BadRequestException);
  }
  const user = { id: 1, fullName: 'Old name', phone: null, birthDate: null, gender: null,
    avatarUrl: '/uploads/avatars/1.png', cardHolder: 'BUYER', cardLast4: '1234', transactionPinHash: 'private-hash' } as User;
  let saves = 0;
  const users = { findOneByOrFail: async ({ id }: { id: number }) => { assert.equal(id, 1); return user; },
    save: async () => { saves++; return user; } };
  const auth = new AuthService(users as never, {} as never, {} as never, {} as never, {} as never);
  const profile = await auth.updateProfile(1, await check({ fullName: ' Updated name ', phone: ' 0123456789 ',
    birthDate: '2000-01-02', gender: UserGender.FEMALE, address: ' Delivery address ' }));
  assert.equal(saves, 1);
  assert.equal(profile.fullName, 'Updated name');
  assert.equal(profile.phone, '0123456789');
  assert.equal(profile.birthDate, '2000-01-02');
  assert.equal(profile.gender, UserGender.FEMALE);
  assert.equal(profile.address, 'Delivery address');
  assert.equal(profile.avatarUrl, '/uploads/avatars/1.png');
  assert.equal(profile.savedCard?.last4, '1234');
  assert.equal(profile.hasTransactionPin, true);
  assert.ok(!('transactionPinHash' in profile));
  const cleared = await auth.updateProfile(1, await check({ phone: null, birthDate: null, gender: null, address: null }));
  assert.equal(cleared.phone, null);
  assert.equal(cleared.birthDate, null);
  assert.equal(cleared.gender, null);
  assert.equal(cleared.address, null);
  assert.equal(cleared.fullName, 'Updated name');
});
