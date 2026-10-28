import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthController } from '../../backend/src/auth/auth.controller';
import { AuthService } from '../../backend/src/auth/auth.service';
import { JwtStrategy } from '../../backend/src/auth/jwt.strategy';
import { AdminController } from '../../backend/src/admin/admin.controller';
import { AdminService } from '../../backend/src/admin/admin.service';
import { User } from '../../backend/src/database/entities/user.entity';
import { PasswordResetToken } from '../../backend/src/database/entities/password-reset-token.entity';

test('QA-AUTH: real HTTP authentication, DTOs, roles and OTP with isolated repositories', async t => {
  const users: User[] = [];
  const tokens: PasswordResetToken[] = [];
  let deliveredOtp = '';
  let rejectEmail = false;
  const usersRepo = {
    exists: async ({ where }: any) => users.some(u => Object.entries(where).every(([k, v]) => (u as any)[k] === v)),
    create: (data: any) => ({ ...data }),
    save: async (user: User) => { if (!user.id) { user.id = users.length + 1; users.push(user); } return user; },
    findOne: async ({ where }: any) => users.find(u => (Array.isArray(where) ? where : [where]).some((w: any) => Object.entries(w).every(([k, v]) => (u as any)[k] === v))) ?? null,
    findOneByOrFail: async ({ id }: any) => { const user = users.find(u => u.id === id); assert.ok(user); return user; },
  };
  const active = (token: PasswordResetToken, where: any) => token.userId === where.userId && token.usedAt == null;
  const resetRepo = {
    create: (data: any) => ({ ...data }),
    save: async (token: PasswordResetToken) => { if (!token.id) { token.id = tokens.length + 1; tokens.push(token); } return token; },
    findOne: async ({ where }: any) => [...tokens].reverse().find(token => active(token, where)) ?? null,
    update: async (where: any, patch: any) => { tokens.filter(token => active(token, where)).forEach(token => Object.assign(token, patch)); },
    delete: async (id: number) => { const i = tokens.findIndex(token => token.id === id); if (i >= 0) tokens.splice(i, 1); },
    manager: { transaction: async (work: any) => work({ save: usersRepo.save, update: async (_entity: any, where: any, patch: any) => resetRepo.update(where, patch) }) },
  };
  const jwt = new JwtService({ secret: 'qa-only-not-a-production-key', signOptions: { expiresIn: '5m' } });
  const auth = new AuthService(usersRepo as never, { create: (data: any) => data, save: async (data: any) => data } as never,
    resetRepo as never, jwt, { sendPasswordResetOtp: async (_email: string, otp: string) => {
      if (rejectEmail) throw new Error('simulated mail outage'); deliveredOtp = otp;
    } } as never);
  const module = await Test.createTestingModule({ controllers: [AuthController, AdminController], providers: [
    { provide: AuthService, useValue: auth }, { provide: AdminService, useValue: { dashboard: () => ({ orders: 0 }), revenue: () => [], usersList: () => [] } },
    { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'qa-only-not-a-production-key' }) }, JwtStrategy,
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  t.after(() => app.close());
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = async (path: string, body?: unknown, token?: string) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  };
  const registration = { fullName: 'QA Buyer', username: 'qa-buyer', email: 'buyer@example.test', password: 'qa-password-123' };
  await t.test('QA-A01 registration rejects invalid, empty and overlong data and role spoofing', async () => {
    for (const patch of [{ email: 'invalid' }, { password: '123' }, { fullName: '' }, { fullName: ' ' },
      { username: ' ' }, { fullName: 'a'.repeat(101) }, { username: 'a'.repeat(51) }, { role: 'ADMIN' }]) {
      assert.equal((await request('/auth/register', { ...registration, ...patch })).status, 400);
    }
    assert.equal(users.length, 0);
  });
  await t.test('QA-A02 registration hashes password, forces USER and rejects duplicates', async () => {
    const result = await request('/auth/register', registration);
    assert.equal(result.status, 201); assert.equal(result.body.user.role, 'USER');
    assert.ok(result.body.accessToken); assert.ok(!('password' in result.body.user));
    assert.notEqual(users[0].password, registration.password);
    assert.ok(await bcrypt.compare(registration.password, users[0].password));
    assert.equal((await request('/auth/register', registration)).status, 409);
    assert.equal((await request('/auth/register', { ...registration, email: 'other@example.test' })).status, 409);
  });
  await t.test('QA-A03 username/email login succeeds; wrong password and unknown account return 401', async () => {
    for (const usernameOrEmail of [registration.username, registration.email]) {
      assert.equal((await request('/auth/login', { usernameOrEmail, password: registration.password })).status, 201);
    }
    for (const usernameOrEmail of [registration.username, 'missing']) {
      assert.equal((await request('/auth/login', { usernameOrEmail, password: 'incorrect' })).status, 401);
    }
  });
  await t.test('QA-A04 JWT missing, invalid, expired and wrong signature cannot read profile', async () => {
    for (const token of [undefined, 'invalid', jwt.sign({ sub: 1 }, { expiresIn: -1 }),
      new JwtService({ secret: 'different-key' }).sign({ sub: 1 })]) {
      assert.equal((await request('/auth/me', undefined, token)).status, 401);
    }
    const own = await request('/auth/me', undefined, jwt.sign({ sub: 1, role: 'USER' }));
    assert.equal(own.status, 200); assert.equal(own.body.id, 1);
    assert.ok(!('transactionPinHash' in own.body));
  });
  await t.test('QA-A05 all admin dashboard routes enforce anonymous 401, USER 403 and ADMIN 200', async () => {
    for (const path of ['/admin/dashboard', '/admin/revenue', '/admin/users']) {
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, undefined, jwt.sign({ sub: 1, role: 'USER' }))).status, 403);
      assert.equal((await request(path, undefined, jwt.sign({ sub: 2, role: 'ADMIN' }))).status, 200);
    }
  });
  await t.test('QA-A06 forgot-password replaces old OTP, stores only hash and uses five-minute expiry', async () => {
    const before = Date.now();
    assert.equal((await request('/auth/forgot-password', { email: registration.email })).status, 201);
    const old = tokens.at(-1)!;
    assert.match(deliveredOtp, /^\d{6}$/); assert.notEqual(old.otpHash, deliveredOtp);
    assert.ok(await bcrypt.compare(deliveredOtp, old.otpHash));
    assert.ok(+old.expiresAt >= before + 300000 && +old.expiresAt <= Date.now() + 300000);
    assert.equal((await request('/auth/forgot-password', { email: registration.email })).status, 201);
    assert.ok(old.usedAt); assert.equal(tokens.filter(token => !token.usedAt).length, 1);
  });
  await t.test('QA-A07 wrong, malformed, expired and unverified OTP cannot reset password', async () => {
    const token = tokens.at(-1)!; const original = users[0].password;
    for (const otp of ['abc', deliveredOtp === '123456' ? '654321' : '123456']) {
      assert.equal((await request('/auth/verify-reset-otp', { email: registration.email, otp })).status, 400);
    }
    const reset = { email: registration.email, otp: deliveredOtp, newPassword: 'qa-replaced-password' };
    assert.equal((await request('/auth/reset-password', reset)).status, 400);
    const expiry = token.expiresAt; token.expiresAt = new Date(0);
    assert.equal((await request('/auth/verify-reset-otp', { email: registration.email, otp: deliveredOtp })).status, 400);
    token.expiresAt = expiry; assert.equal(users[0].password, original);
  });
  await t.test('QA-A08 verified OTP resets password exactly once and invalidates previous credentials', async () => {
    assert.equal((await request('/auth/verify-reset-otp', { email: registration.email, otp: deliveredOtp })).status, 201);
    const reset = { email: registration.email, otp: deliveredOtp, newPassword: 'qa-replaced-password' };
    assert.equal((await request('/auth/reset-password', reset)).status, 201);
    assert.equal((await request('/auth/reset-password', reset)).status, 400);
    assert.equal((await request('/auth/verify-reset-otp', { email: registration.email, otp: deliveredOtp })).status, 400);
    assert.equal((await request('/auth/login', { usernameOrEmail: registration.email, password: registration.password })).status, 401);
    assert.equal((await request('/auth/login', { usernameOrEmail: registration.email, password: reset.newPassword })).status, 201);
  });
  await t.test('QA-A09 failed mail delivery removes pending token and exposes no OTP', async () => {
    rejectEmail = true; const size = tokens.length;
    const result = await request('/auth/forgot-password', { email: registration.email });
    assert.equal(result.status, 500); assert.equal(tokens.length, size);
    assert.equal(JSON.stringify(result.body).includes(deliveredOtp), false);
  });
});
