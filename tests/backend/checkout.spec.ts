import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getMetadataArgsStorage } from 'typeorm';
import { PayOS } from '@payos/node';
import * as bcrypt from 'bcryptjs';
import { PromotionsService } from '../../backend/src/promotions/promotions.service';
import { Promotion } from '../../backend/src/database/entities/promotion.entity';
import { promotionPhase, salePrice } from '../../backend/src/promotions/promotion-price';
import { Cart } from '../../backend/src/database/entities/cart.entity';
import { CartItem } from '../../backend/src/database/entities/cart-item.entity';
import { Product } from '../../backend/src/database/entities/product.entity';
import { UserAddress } from '../../backend/src/database/entities/user-address.entity';
import { User } from '../../backend/src/database/entities/user.entity';
import { Order } from '../../backend/src/database/entities/order.entity';
import { OrderItem } from '../../backend/src/database/entities/order-item.entity';
import { Payment } from '../../backend/src/database/entities/payment.entity';
import { Coupon } from '../../backend/src/database/entities/coupon.entity';
import { CheckoutRecord } from '../../backend/src/database/entities/checkout-record.entity';
import { PaymentMethod } from '../../backend/src/database/entities/enums';
import { CartService } from '../../backend/src/cart/cart.service';
import { OrdersService } from '../../backend/src/orders/orders.service';
import { AddressesService } from '../../backend/src/addresses/addresses.service';
import { CouponsService, evaluateCoupon } from '../../backend/src/coupon/coupons.service';
import { FavoritesService } from '../../backend/src/favorites/favorites.service';
import { PaymentService } from '../../backend/src/payment/payment.service';
import { JwtStrategy } from '../../backend/src/auth/jwt.strategy';
import { ChatCheckoutService } from '../../backend/src/chat/chat-checkout.service';
import { ChatUserActionsService } from '../../backend/src/chat/chat-user-actions.service';
import { ChatShoppingService } from '../../backend/src/chat/chat-shopping.service';
import { ChatService } from '../../backend/src/chat/chat.service';
import { ChatController } from '../../backend/src/chat/chat.controller';
import { CartController } from '../../backend/src/cart/cart.controller';
import { OrdersController } from '../../backend/src/orders/orders.controller';
import { CouponsController } from '../../backend/src/coupon/coupons.controller';
import { ChatProductsService, productQuery } from '../../backend/src/chat/chat-products.service';
import { GeminiService } from '../../backend/src/chat/gemini.service';
import { KnowledgeService } from '../../backend/src/chat/knowledge.service';
import { IntentService } from '../../backend/src/chat/intent.service';
import { SmallTalkService } from '../../backend/src/chat/small-talk.service';
import { normalizeText } from '../../backend/src/chat/chat-matching';

// Isolated transactional repository model: rollback + serialization, no .env, MySQL or provider calls.
// It verifies application invariants/lock requests, not MySQL's lock implementation.
function fixture() {
  const tables = new Map<any, any[]>([Cart, CartItem, Product, UserAddress, User, Order, OrderItem, Payment, Coupon, CheckoutRecord, Promotion].map(entity => [entity, []]));
  const rows = (entity: any): any[] => tables.get(entity)!;
  const locks: Array<{ entity: any; mode: string }> = [];
  const match = (row: any, where: any): boolean => Array.isArray(where) ? where.some(w => match(row, w)) : Object.entries(where ?? {}).every(([key, value]: any) =>
    value?._type === 'isNull' ? row[key] == null : value instanceof Date ? +row[key] === +value : row[key] === value);
  const repositories = new Map<any, any>();
  const transactionScope = new AsyncLocalStorage<boolean>();
  let tail: Promise<unknown> = Promise.resolve(); let inTransaction = false;
  const source: any = { getRepository: (entity: any) => repo(entity), transaction: (work: any) => {
    const result = tail.catch(() => {}).then(async () => {
      const snapshot = structuredClone([...tables.values()]); inTransaction = true;
      try { return await transactionScope.run(true, () => work(manager)); } catch (error) {
        [...tables.keys()].forEach((entity, i) => tables.set(entity, snapshot[i])); throw error;
      } finally { inTransaction = false; }
    }); tail = result; return result;
  } };
  const manager: any = { query: async () => { assert.ok(inTransaction); return [{ id: 1 }]; }, getRepository: (entity: any) => repo(entity), create: (entity: any, data: any) => repo(entity).create(data), save: (entity: any, data: any) => repo(entity).save(data) };
  const repo = (entity: any): any => {
    if (repositories.has(entity)) return repositories.get(entity);
    const repository: any = {
      manager: source, create: (data: any) => ({ ...data }),
      find: async ({ where, order, lock, relations }: any = {}) => {
        if (lock) { assert.ok(inTransaction); locks.push({ entity, mode: lock.mode }); }
        let found = rows(entity).filter(row => match(row, where)).map(row => structuredClone(row));
        if (entity === CartItem) found.forEach(row => row.product = structuredClone(rows(Product).find(p => p.id === row.productId)));
        if (entity === Order && relations?.includes('items')) found.forEach(row => row.items = structuredClone(rows(OrderItem).filter(item => item.orderId === row.id)));
        for (const [key, direction] of Object.entries(order ?? {}).reverse()) found.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'DESC' ? -1 : 1));
        return found;
      },
      findOne: async (options: any) => (await repository.find(options))[0] ?? null,
      findOneBy: async (where: any) => repository.findOne({ where }),
      findOneOrFail: async (options: any) => { const row = await repository.findOne(options); if (!row) throw new NotFoundException(); return row; },
      findOneByOrFail: (where: any) => repository.findOneOrFail({ where }),
      existsBy: async (where: any) => rows(entity).some(row => match(row, where)),
      save: async (data: any): Promise<any> => {
        if (Array.isArray(data)) { const saved = []; for (const row of data) saved.push(await repository.save(row)); return saved; }
        const saved = { ...structuredClone(data), id: data.id ?? Math.max(0, ...rows(entity).map(row => Number(row.id))) + 1, updatedAt: new Date() };
        const current = rows(entity).find(row => row.id === saved.id);
        if (entity === Payment && rows(entity).some(row => row.id !== saved.id && (row.orderId === saved.orderId || saved.payosLinkId && row.payosLinkId === saved.payosLinkId))) throw new Error('Unique payment violated');
        if (entity === CheckoutRecord && saved.orderId && rows(entity).some(row => row.id !== saved.id && row.orderId === saved.orderId)) throw new Error('Unique checkout/order violated');
        if (current) Object.assign(current, saved); else rows(entity).push({ createdAt: new Date(), ...saved });
        return structuredClone(rows(entity).find(row => row.id === saved.id));
      },
      update: async (where: any, patch: any): Promise<any> => {
        if (!transactionScope.getStore()) return source.transaction(() => repository.update(where, patch));
        const found = rows(entity).filter(row => match(row, where)); found.forEach(row => Object.assign(row, structuredClone(patch))); return { affected: found.length };
      },
      delete: async (where: any) => { const source = rows(entity); for (let i = source.length - 1; i >= 0; i--) if (match(source[i], where)) source.splice(i, 1); },
      remove: (row: any) => repository.delete({ id: row.id }),
    };
    repositories.set(entity, repository); return repository;
  };
  rows(Product).push(...[{ id: 10, name: 'Bàn gỗ', price: '500000', stock: 8 }, { id: 20, name: 'Ghế gỗ', price: '200000', stock: 10 }, { id: 30, name: 'Bàn hết hàng', price: '900000', stock: 0 }].map(row => ({ ...row, imageUrl: null, category: 'Nội thất', brand: null, isFeatured: false })));
  for (const id of [1, 2]) {
    rows(User).push({ id, email: `u${id}@example.test`, fullName: `User ${id}` });
    rows(Cart).push({ id, userId: id });
    rows(UserAddress).push({ id: id * 100 + 1, userId: id, fullName: `Nguyễn Văn ${id}`, phone: '0901111111', address: `${id} Nguyễn Trãi, Hà Nội`, isDefault: true, updatedAt: new Date() });
  }
  const coupon = { id: 1, userId: null, code: 'SALE10', discountType: 'percentage', discountValue: 10, minOrderAmount: 500000, maxDiscountAmount: 100000, usageLimit: 5, usedCount: 0, isActive: true, startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), freeShipping: false };
  rows(Coupon).push(coupon, { ...coupon, id: 2, code: 'OTHER2', userId: 2 }, { ...coupon, id: 3, code: 'EXPIRED', endDate: new Date(0) });
  const config = new ConfigService({ JWT_SECRET: 'checkout-fixture', GEMINI_API_KEY: 'fixture', PAYOS_CLIENT_ID: 'fixture', PAYOS_API_KEY: 'fixture', PAYOS_CHECKSUM_KEY: 'fixture-checksum', PAYOS_CANCEL_URL: 'https://example.test/cart', PAYOS_RETURN_URL: 'https://example.test/checkout/success' });
  source.manager = manager;
  const promotions = new PromotionsService(source);
  promotions.active = async () => rows(Promotion).find(event => promotionPhase(event) === 'active') ?? null;
  const makeOrders = () => new OrdersService(source, repo(Order), repo(Product), repo(Cart), repo(CartItem), repo(OrderItem), repo(Payment), repo(User), promotions);
  const orders = makeOrders();
  const payment = new PaymentService(source, config, repo(Order), repo(Payment), repo(User));
  const payos = new PayOS({ clientId: 'fixture', apiKey: 'fixture', checksumKey: 'fixture-checksum' });
  const remote = new Map<number, any>(); let creates = 0; let loseCreateResponse = false;
  payos.paymentRequests.get = async (id: number | string): Promise<any> => { assert.ok(!transactionScope.getStore(), 'Network call inside transaction'); const result = remote.get(Number(id)); if (!result) throw { status: 404 }; return structuredClone(result); };
  payos.paymentRequests.create = async (body: any): Promise<any> => {
    assert.ok(!transactionScope.getStore()); creates++; assert.ok(!remote.has(body.orderCode), 'Duplicate provider POST');
    const link = { id: `link${body.orderCode}`, orderCode: body.orderCode, amount: body.amount, amountPaid: 0, amountRemaining: body.amount, status: 'PENDING', transactions: [] };
    remote.set(body.orderCode, link);
    if (loseCreateResponse) { loseCreateResponse = false; throw new Error('simulated timeout after provider commit'); }
    return { ...link, paymentLinkId: link.id, checkoutUrl: `https://pay.payos.vn/web/${link.id}` };
  };
  (payment as any).payos = payos;
  const cart = new CartService(repo(Cart), repo(CartItem), promotions); const addresses = new AddressesService(repo(UserAddress)); const coupons = new CouponsService(repo(Coupon), cart);
  const products: any = {
    findById: async (id: number) => { const product = rows(Product).find(row => row.id === id); if (!product) throw new NotFoundException(); return product; },
    context: async (message: string) => { const query = productQuery(message); return query.related ? { hash: 'fixture', keyword: query.keyword, products: rows(Product).filter(p => query.terms.every(term => normalizeText(p.name).includes(term)) && p.stock > 0) } : null; },
  };
  const gemini = new GeminiService(config); gemini.interpretAction = async () => null;
  const favorites = { list: async () => [] } as unknown as FavoritesService;
  const userActions = new ChatUserActionsService(orders, favorites, addresses, coupons, cart, products, gemini);
  const checkout = new ChatCheckoutService(orders, payment, cart, addresses, coupons, userActions, products);
  const makeChat = () => new ChatService({ candidates: async () => [], reviewedOrPending: async () => null } as any, products, new IntentService(new SmallTalkService()), new SmallTalkService(), gemini, new ChatShoppingService(products, cart, addresses), userActions, checkout);
  let sequence = 0;
  const handle = async (state: any, options: any, userId = 1) => (await checkout.handle({ message: 'Thao tác', sessionId: 'checkout', requestId: `request-${++sequence}`, ...options }, state, { id: userId, role: 'USER', email: `u${userId}@example.test` } as any))!;
  const quote = async (userId = 1, method = PaymentMethod.CASH, couponCode?: string) => orders.previewCheckout(userId, { addressId: userId * 100 + 1, paymentMethod: method, couponCode });
  const webhook = async (orderId: number, patch: any = {}) => {
    const data = { orderCode: orderId, amount: Number(rows(Order).find(row => row.id === orderId).totalAmount), description: 'fixture', accountNumber: 'fixture', reference: `REF${orderId}`, transactionDateTime: '2026-10-21 12:00:00', currency: 'VND', paymentLinkId: `link${orderId}`, code: '00', desc: 'success', ...patch };
    const signature = await payos.crypto.createSignatureFromObj(data, 'fixture-checksum');
    return { code: '00', desc: 'success', success: true, data, signature } as any;
  };
  return { rows, repo, locks, source, config, promotions, cart, orders, makeOrders, payment, products, addresses, coupons, userActions, checkout, gemini, favorites, makeChat, handle, quote, remote, webhook, creates: () => creates, loseResponse: () => { loseCreateResponse = true; } };
}

test('QA-HTTP: cart and orders enforce JWT, ownership, DTOs and repeatable checkout', async t => {
  const f = fixture();
  const module = await Test.createTestingModule({ controllers: [CartController, OrdersController, CouponsController], providers: [
    { provide: CartService, useValue: f.cart }, { provide: OrdersService, useValue: f.orders },
    { provide: CouponsService, useValue: f.coupons },
    { provide: ConfigService, useValue: f.config }, JwtStrategy,
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  t.after(() => app.close()); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(); const jwt = new JwtService({ secret: 'checkout-fixture' });
  const call = async (method: string, path: string, body?: unknown, userId?: number, role = 'USER') => {
    const response = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json',
      ...(userId ? { Authorization: 'Bearer ' + jwt.sign({ sub: userId, role }) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json() };
  };
  await t.test('QA-B01 anonymous cart/orders and ordinary USER admin access are denied', async () => {
    for (const path of ['/cart', '/orders', '/admin/orders']) assert.equal((await call('GET', path)).status, 401);
    assert.equal((await call('GET', '/admin/orders', undefined, 1)).status, 403);
    assert.equal((await call('GET', '/admin/orders', undefined, 1, 'ADMIN')).status, 200);
  });
  await t.test('QA-B02 invalid quantities, missing products, zero stock and owner spoofing do not mutate cart', async () => {
    for (const body of [{ productId: 10, quantity: 0 }, { productId: 10, quantity: -1 },
      { productId: 10, quantity: 1.5 }, { productId: 30, quantity: 1 }, { productId: 10, quantity: 99 },
      { productId: 10, quantity: 1, userId: 2 }]) assert.equal((await call('POST', '/cart/add', body, 1)).status, 400);
    assert.equal((await call('POST', '/cart/add', { productId: 999, quantity: 1 }, 1)).status, 404);
    assert.equal(f.rows(CartItem).length, 0);
  });
  await t.test('QA-B03 cart add/update/remove stay inside the signed-in account', async () => {
    assert.equal((await call('POST', '/cart/add', { productId: 10, quantity: 2 }, 1)).body.total, 1000000);
    assert.equal((await call('POST', '/cart/add', { productId: 10, quantity: 1 }, 2)).body.itemCount, 1);
    assert.equal((await call('PUT', '/cart/update', { productId: 10, quantity: 3 }, 1)).body.itemCount, 3);
    await call('DELETE', '/cart/remove/10', undefined, 2);
    assert.equal((await call('GET', '/cart', undefined, 1)).body.itemCount, 3);
    assert.equal((await call('GET', '/cart', undefined, 2)).body.itemCount, 0);
  });
  await t.test('QA-E01 malformed coupon input returns 400 rather than an internal server error', async () => {
    for (const body of [{}, { code: 123, orderAmount: 1 }, { code: ' ', orderAmount: 1 },
      { code: 'SALE10', orderAmount: -1 }, { code: 'SALE10', orderAmount: 1, userId: 2 }]) {
      assert.equal((await call('POST', '/coupons/validate', body, 1)).status, 400);
    }
  });
  await t.test('QA-C01 forged client prices are rejected and server quote controls repeated order creation', async () => {
    const input = { fullName: 'QA Buyer', email: 'buyer@example.test', phone: '0900000000', address: 'QA address', paymentMethod: PaymentMethod.CASH };
    assert.equal((await call('POST', '/orders/preview', { ...input, totalAmount: 1 }, 1)).status, 400);
    assert.equal((await call('POST', '/orders', input, 1)).status, 409);
    const preview = await call('POST', '/orders/preview', input, 1);
    assert.equal(preview.status, 201); assert.equal(preview.body.total, 1500000);
    const payload = { ...input, quoteId: preview.body.id, quoteHash: preview.body.hash };
    const a = await call('POST', '/orders', payload, 1), b = await call('POST', '/orders', payload, 1);
    assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(a.body.id, b.body.id);
    assert.equal(f.rows(Order).length, 1); assert.equal(f.rows(Product)[0].stock, 5);
    assert.equal(f.rows(Payment).length, 1); assert.equal(f.rows(CartItem).length, 0);
  });
  await t.test('QA-C02 foreign order access is forbidden and delivered COD synchronizes payment state', async () => {
    const id = f.rows(Order)[0].id;
    assert.equal((await call('GET', '/orders/' + id, undefined, 2)).status, 403);
    assert.deepEqual((await call('GET', '/orders', undefined, 2)).body, []);
    assert.equal((await call('GET', '/orders/999', undefined, 1)).status, 404);
    assert.equal((await call('PATCH', `/admin/orders/${id}/status`, { status: 'DELIVERED' }, 1)).status, 403);
    assert.equal((await call('PATCH', `/admin/orders/${id}/status`, { status: 'INVENTED' }, 1, 'ADMIN')).status, 400);
    const result = await call('PATCH', `/admin/orders/${id}/status`, { status: 'DELIVERED' }, 1, 'ADMIN');
    assert.equal(result.status, 200); assert.equal(result.body.paymentStatus, 'PAID');
    assert.equal(f.rows(Payment)[0].status, 'SUCCESS');
  });
});

test('single-product checkout collects own address/voucher/method; only explicit confirmation creates order', async () => {
  const f = fixture(); const state: any = {};
  let result = await f.handle(state, { action: 'checkout_start', productId: 10, quantity: 2 });
  assert.equal(result.checkoutFlow?.stage, 'collecting_address'); assert.equal(f.rows(Order).length, 0);
  result = await f.handle(state, { action: 'checkout_address', addressId: 101 });
  assert.equal(result.checkoutFlow?.stage, 'selecting_voucher');
  await f.handle(state, { action: 'checkout_best_voucher' });
  result = await f.handle(state, { action: 'checkout_payment', paymentMethod: PaymentMethod.CASH });
  const quote = result.checkoutFlow!.quote!;
  assert.equal(quote.subtotal, 1000000); assert.equal(quote.discountAmount, 100000); assert.equal(quote.shippingFee, 0); assert.equal(quote.total, 900000);
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Product)[0].stock, 8);
  await f.handle(state, { message: 'ok' }); assert.equal(f.rows(Order).length, 0);
  result = await f.handle(state, { action: 'checkout_place_order', checkoutId: quote.id, quoteHash: quote.hash });
  assert.equal(result.checkoutFlow?.order?.totalAmount, 900000); assert.equal(result.checkoutFlow?.order?.paymentStatus, 'UNPAID');
  assert.equal(result.cart?.itemCount, 0); assert.equal(f.rows(Product)[0].stock, 6); assert.equal(f.rows(Coupon)[0].usedCount, 1);
  assert.equal(f.rows(Payment).length, 1);
  for (const entity of [Cart, Product, Coupon, CheckoutRecord]) assert.ok(f.locks.some(lock => lock.entity === entity && lock.mode === 'pessimistic_write'));
  const cancelled = await f.handle(state, { action: 'checkout_cancel' }); assert.match(cancelled.message, /không hủy đơn/); assert.equal(f.rows(Order).length, 1);
});

test('applying letter-only voucher K in chat immediately returns discounted checkout totals', async () => {
  const f = fixture(); f.rows(Coupon).push({ ...f.rows(Coupon)[0], id: 4, code: 'K' });
  await f.cart.add(1, 10, 1);
  const chat = f.makeChat();
  const reply = await chat.send('Áp dụng voucher K', 'voucher-k', { id: 1 } as any, { message: 'Áp dụng voucher K', requestId: 'apply-k' });
  assert.equal(reply.checkoutFlow?.couponCode, 'K');
  assert.deepEqual(reply.checkoutFlow?.appliedVoucher, { code: 'K', discountAmount: 50000, finalAmount: 450000 });
  assert.equal(reply.checkoutFlow?.stage, 'collecting_address');
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Coupon)[3].usedCount, 0);
});

test('voucher K applies through the button and natural chat, recalculates an existing quote, and can be removed', async () => {
  const f = fixture(); f.rows(Coupon).push({ ...f.rows(Coupon)[0], id: 4, code: 'K' });
  const state: any = {};
  await f.handle(state, { action: 'checkout_start', productId: 10 });
  await f.handle(state, { action: 'checkout_address', addressId: 101 });
  let reply = await f.handle(state, { action: 'checkout_voucher', code: '  k  ' });
  assert.deepEqual(reply.checkoutFlow?.appliedVoucher, { code: 'K', discountAmount: 50000, finalAmount: 450000 });
  assert.equal(reply.checkoutFlow?.stage, 'selecting_payment');
  reply = await f.handle(state, { action: 'checkout_payment', paymentMethod: 'CASH' });
  const oldQuote = reply.checkoutFlow!.quote!;
  reply = await f.handle(state, { message: 'Bỏ voucher' });
  assert.equal(reply.checkoutFlow?.quote?.total, 500000); assert.equal(reply.checkoutFlow?.appliedVoucher, undefined);
  await assert.rejects(f.orders.confirmCheckout(1, oldQuote.id, oldQuote.hash), ConflictException);
  reply = await f.handle(state, { message: 'Áp dụng voucher K' });
  assert.equal(reply.checkoutFlow?.stage, 'awaiting_confirmation');
  assert.equal(reply.checkoutFlow?.quote?.couponCode, 'K'); assert.equal(reply.checkoutFlow?.quote?.total, 450000);
  assert.equal(f.rows(Order).length, 0);
  const invalid = await f.handle(state, { message: 'Áp dụng voucher EXPIRED' });
  assert.equal(invalid.error?.code, 'VALIDATION_ERROR'); assert.match(invalid.message, /hết hạn/);
  assert.equal(invalid.checkoutFlow?.couponCode, 'K'); assert.equal(f.rows(Coupon)[3].usedCount, 0);
  reply = await f.handle(state, { message: 'Chọn mã tốt nhất' });
  assert.equal(reply.error, undefined); assert.equal(reply.checkoutFlow?.quote?.total, 450000);
  const quote = reply.checkoutFlow!.quote!;
  const created = await f.handle(state, { action: 'checkout_place_order', checkoutId: quote.id, quoteHash: quote.hash });
  assert.equal(created.checkoutFlow?.order?.discountAmount, 50000); assert.equal(created.checkoutFlow?.order?.totalAmount, 450000);
});

test('multi-product named/ordinal selection, quantity editing/removal, new address and cancellation', async () => {
  const f = fixture(); const state: any = { context: { products: f.rows(Product).slice(0, 2) } };
  let result = await f.handle(state, { message: 'Mua 2 Bàn gỗ và 3 Ghế gỗ' });
  assert.equal(result.cart?.itemCount, 5);
  assert.deepEqual(result.cart?.items.map(row => row.quantity), [2, 3]);
  await f.handle(state, { action: 'checkout_item_update', productId: 10, quantity: 1 });
  await f.handle(state, { action: 'checkout_item_remove', productId: 20 });
  result = await f.handle(state, { action: 'checkout_address', address: { fullName: 'Lê Ánh', phone: '0902222222', address: '15 Huế, Hà Nội' } });
  assert.ok(result.checkoutFlow?.addresses.some(address => address.fullName === 'Lê Ánh'));
  await f.handle(state, { action: 'checkout_voucher', code: '' });
  result = await f.handle(state, { action: 'checkout_payment', paymentMethod: 'CASH' });
  assert.equal(result.checkoutFlow?.quote?.total, 500000);
  await f.handle(state, { action: 'checkout_cancel' }); assert.equal(f.rows(Order).length, 0);
  assert.equal(f.rows(CheckoutRecord)[0].state, 'cancelled');
  result = await f.handle({}, { message: 'Mua sản phẩm thứ hai', items: [{ productId: 10, quantity: 2 }, { productId: 20, quantity: 3 }] });
  const quote = await f.quote(); const created = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  assert.deepEqual(created.order?.items.map(item => item.quantity), [2, 3]);
  const other = fixture(); const selected = await other.handle({ context: { products: other.rows(Product).slice(0, 2) } }, { message: 'Mua sản phẩm thứ hai' });
  assert.equal(selected.cart?.items[0].productId, 20);
  const contextual = fixture();
  const contextualReply = await contextual.handle({ selectedId: 10, context: { products: contextual.rows(Product).slice(0, 2) } }, { message: 'Mua cho tôi 2 chiếc bàn này, giao về nhà và thanh toán QR.' });
  assert.equal(contextualReply.cart?.items[0].quantity, 2); assert.equal(contextualReply.checkoutFlow?.paymentMethod, 'QR'); assert.equal(contextualReply.checkoutFlow?.stage, 'collecting_address');
});

test('invalid products, stock, ownership, invalid/expired/private vouchers and expiry fail without side effects', async () => {
  const f = fixture();
  await assert.rejects(f.cart.setMany(1, [{ productId: 10, quantity: 1 }, { productId: 999, quantity: 1 }]), NotFoundException);
  assert.equal(f.rows(CartItem).length, 0);
  for (const item of [{ productId: 10, quantity: 99 }, { productId: 30, quantity: 1 }]) await assert.rejects(f.cart.setMany(1, [item]), BadRequestException);
  await f.cart.setMany(1, [{ productId: 10, quantity: 1 }]);
  await assert.rejects(f.orders.previewCheckout(1, { addressId: 201, paymentMethod: PaymentMethod.CASH }), NotFoundException);
  for (const code of ['MISSING', 'OTHER2', 'EXPIRED']) await assert.rejects(f.quote(1, PaymentMethod.CASH, code), BadRequestException);
  await f.cart.setMany(1, [{ productId: 20, quantity: 1 }]); await f.cart.remove(1, 10);
  await assert.rejects(f.quote(1, PaymentMethod.CASH, 'SALE10'), BadRequestException);
  const quote = await f.quote(); f.rows(CheckoutRecord)[0].expiresAt = new Date(0);
  await assert.rejects(f.orders.confirmCheckout(1, quote.id, quote.hash), ConflictException);
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Product)[0].stock, 8); assert.equal(f.rows(Coupon)[0].usedCount, 0);
});

test('cart/price/address/coupon changes require a fresh summary and another confirmation', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1);
  const quote = await f.quote(1, PaymentMethod.CASH, 'SALE10');
  await f.cart.update(1, 10, 2); f.rows(Product)[0].price = '600000'; f.rows(UserAddress)[0].phone = '0903333333';
  f.rows(Coupon)[0].discountValue = 5;
  const changed = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  assert.equal(changed.changed, true); assert.equal(changed.quote?.total, 1140000); assert.equal(changed.quote?.address.phone, '0903333333'); assert.equal(f.rows(Order).length, 0);
  await assert.rejects(f.orders.confirmCheckout(1, quote.id, quote.hash), ConflictException);
  const created = await f.orders.confirmCheckout(1, changed.quote!.id, changed.quote!.hash);
  assert.equal(created.order?.totalAmount, 1140000);
});

test('durable UUID/hash survives concurrent confirmations, response timeout, process/session restart and rejects changed content', async () => {
  const f = fixture(); await f.cart.add(1, 10, 2); const quote = await f.quote(1, PaymentMethod.CASH, 'SALE10');
  const otherProcess = f.makeOrders();
  const [a, b] = await Promise.all([f.orders.confirmCheckout(1, quote.id, quote.hash), otherProcess.confirmCheckout(1, quote.id, quote.hash)]);
  assert.equal(a.order!.id, b.order!.id); assert.equal(f.rows(Order).length, 1); assert.equal(f.rows(Payment).length, 1); assert.equal(f.rows(OrderItem).length, 1);
  assert.equal(f.rows(Product)[0].stock, 6); assert.equal(f.rows(Coupon)[0].usedCount, 1);
  f.rows(CheckoutRecord)[0].expiresAt = new Date(0);
  const replay = await f.handle({}, { action: 'checkout_place_order', checkoutId: quote.id, quoteHash: quote.hash });
  assert.equal(replay.checkoutFlow?.order?.id, a.order!.id); assert.equal(f.rows(Order).length, 1);
  await assert.rejects(otherProcess.confirmCheckout(1, quote.id, '0'.repeat(64)), ConflictException);
  await assert.rejects(otherProcess.confirmCheckout(2, quote.id, quote.hash), NotFoundException);
  const injected = await f.handle({}, { action: 'checkout_place_order', checkoutId: quote.id, quoteHash: quote.hash, quantity: 99 }); assert.ok(injected.error);
  assert.equal(f.rows(Order).length, 1);
});

test('last stock unit and last coupon use cannot be consumed by two concurrent users', async () => {
  for (const resource of ['stock', 'coupon']) {
    const f = fixture(); if (resource === 'stock') f.rows(Product)[0].stock = 1; else f.rows(Coupon)[0].usageLimit = 1;
    await f.cart.add(1, 10, 1); await f.cart.add(2, 10, 1);
    const a = await f.quote(1, PaymentMethod.CASH, resource === 'coupon' ? 'SALE10' : undefined);
    const b = await f.quote(2, PaymentMethod.CASH, resource === 'coupon' ? 'SALE10' : undefined);
    const results = await Promise.allSettled([f.orders.confirmCheckout(1, a.id, a.hash), f.makeOrders().confirmCheckout(2, b.id, b.hash)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.rows(Order).length, 1);
    assert.equal(f.rows(Product)[0].stock, resource === 'stock' ? 0 : 7); assert.equal(f.rows(Coupon)[0].usedCount, resource === 'coupon' ? 1 : 0);
  }
});

test('failure after stock/order writes rolls back everything; retry commits once; ordinary checkout shares the formula', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); const quote = await f.quote(1, PaymentMethod.CASH, 'SALE10');
  const save = f.repo(Payment).save; let fail = true;
  f.repo(Payment).save = async (data: any) => { const result = await save(data); if (fail) { fail = false; throw new Error('simulated database failure'); } return result; };
  await assert.rejects(f.orders.confirmCheckout(1, quote.id, quote.hash), /simulated database failure/);
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(OrderItem).length, 0); assert.equal(f.rows(Payment).length, 0); assert.equal(f.rows(Product)[0].stock, 8); assert.equal(f.rows(Coupon)[0].usedCount, 0); assert.equal(f.rows(CartItem)[0].quantity, 1);
  await f.orders.confirmCheckout(1, quote.id, quote.hash); assert.equal(f.rows(Order).length, 1);
  const ordinary = fixture(); await ordinary.cart.add(1, 10, 1);
  const input = { fullName: 'Nguyễn An', email: 'u1@example.test', phone: '0901111111', address: 'Hà Nội', paymentMethod: PaymentMethod.CASH, couponCode: 'SALE10' };
  const quoted = await ordinary.orders.previewCheckout(1, input);
  const created = await ordinary.orders.create(1, { ...input, quoteId: quoted.id, quoteHash: quoted.hash });
  assert.equal(created.totalAmount, 450000); assert.equal(created.discountAmount, evaluateCoupon(ordinary.rows(Coupon)[0], 500000, 1).discountAmount);
  const base = ordinary.rows(Coupon)[0];
  assert.equal(evaluateCoupon({ ...base, discountValue: 25 } as any, 2000000, 1).discountAmount, 100000);
  assert.equal(evaluateCoupon({ ...base, discountType: 'fixed', discountValue: 9999999 } as any, 500000, 1).finalAmount, 0);
});

test('PayOS uses owned persisted order amount; reuse, simultaneous link requests and provider timeout recovery never POST twice', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); const quote = await f.quote(1, PaymentMethod.QR);
  const { order } = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  await assert.rejects(f.payment.createPayOSLink(2, order!.id), ForbiddenException); assert.equal(f.creates(), 0);
  f.loseResponse();
  const results = await Promise.allSettled([f.payment.createPayOSLink(1, order!.id), f.payment.createPayOSLink(1, order!.id)]);
  const success = results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>;
  assert.equal(success.value.checkoutUrl, `https://pay.payos.vn/web/link${order!.id}`); assert.equal(f.creates(), 1);
  assert.equal(f.remote.get(order!.id).amount, order!.totalAmount); assert.equal(f.remote.get(order!.id).orderCode, order!.id);
  await f.payment.createPayOSLink(1, order!.id); assert.equal(f.creates(), 1);
  assert.equal(f.rows(Payment)[0].payosLeaseUntil, null); assert.equal(f.rows(Order)[0].paymentStatus, 'UNPAID');
  f.remote.get(order!.id).amount += 1; await assert.rejects(f.payment.createPayOSLink(1, order!.id), BadRequestException);
  assert.equal(f.rows(Order).length, 1);
});

test('SDK signature + amount/link/currency checks; valid/repeated webhook updates exactly the right order', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); const quote = await f.quote(1, PaymentMethod.QR);
  const { order } = await f.orders.confirmCheckout(1, quote.id, quote.hash); await f.payment.createPayOSLink(1, order!.id);
  const valid = await f.webhook(order!.id);
  await assert.rejects(f.payment.handlePayOSWebhook({ ...valid, signature: 'forged' }), BadRequestException);
  for (const patch of [{ amount: 1 }, { paymentLinkId: 'differentLink' }, { currency: 'USD' }, { reference: '' }, { transactionDateTime: 'invalid-date' }]) await assert.rejects(f.payment.handlePayOSWebhook(await f.webhook(order!.id, patch)), BadRequestException);
  assert.equal(f.rows(Order)[0].paymentStatus, 'UNPAID');
  await Promise.all([f.payment.handlePayOSWebhook(valid), f.payment.handlePayOSWebhook(valid)]);
  assert.equal(f.rows(Order)[0].paymentStatus, 'PAID'); assert.equal(f.rows(Order)[0].status, 'CONFIRMED');
  assert.equal(f.rows(Payment)[0].transactionId, `REF${order!.id}`); assert.equal(f.rows(Payment).length, 1); assert.equal(f.rows(Product)[0].stock, 7);
});

test('pending/underpaid/return claims stay unpaid; signed GET can recover a delayed webhook', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); const quote = await f.quote(1, PaymentMethod.QR);
  const { order } = await f.orders.confirmCheckout(1, quote.id, quote.hash); await f.payment.createPayOSLink(1, order!.id);
  const state: any = {};
  const pending = await f.handle(state, { action: 'checkout_status', orderId: order!.id });
  assert.equal(pending.checkoutFlow?.order?.paymentStatus, 'UNPAID'); assert.match(pending.message, /Chưa xác minh/);
  const remote = f.remote.get(order!.id); remote.status = 'PAID'; remote.amountPaid = 1; remote.amountRemaining = order!.totalAmount - 1;
  await assert.rejects(f.payment.refreshStatus(1, order!.id), BadRequestException); assert.equal(f.rows(Order)[0].paymentStatus, 'UNPAID');
  remote.amountPaid = order!.totalAmount; remote.amountRemaining = 0; remote.transactions = [{ amount: order!.totalAmount, reference: 'GETREF', transactionDateTime: '2026-10-21 12:00:00' }];
  const paid = await f.handle(state, { action: 'checkout_status', orderId: order!.id });
  assert.equal(paid.checkoutFlow?.order?.paymentStatus, 'PAID'); assert.equal(paid.checkoutFlow?.paymentUrl, undefined);
  await f.cart.add(1, 20, 1); const nextQuote = await f.quote(1, PaymentMethod.QR);
  const next = await f.orders.confirmCheckout(1, nextQuote.id, nextQuote.hash);
  state.checkoutFlow.paymentUrl = 'https://pay.payos.vn/web/oldLink';
  const switched = await f.handle(state, { action: 'checkout_status', orderId: next.order!.id });
  assert.equal(switched.checkoutFlow?.order?.id, next.order!.id); assert.equal(switched.checkoutFlow?.paymentUrl, undefined);
  const account = await f.userActions.handle({ message: 'Danh sách đơn', action: 'orders_list', sessionId: 'reloaded', requestId: 'reload' }, { quantity: 1 }, { id: 1 } as any);
  const resume = account!.actions!.find(action => action.type === 'checkout_payment_link' && action.orderId === next.order!.id)!;
  assert.ok(resume); const resumed = await f.handle({}, { action: resume.type, orderId: resume.orderId });
  assert.equal(resumed.checkoutFlow?.order?.id, next.order!.id); assert.equal(resumed.checkoutFlow?.paymentUrl, `https://pay.payos.vn/web/link${next.order!.id}`); assert.equal(f.rows(Order).length, 2);
});

test('CARD is explicitly simulated; missing setup rejected and dedicated PIN payment is idempotent', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1);
  await assert.rejects(f.quote(1, PaymentMethod.CARD), BadRequestException);
  Object.assign(f.rows(User)[0], { cardHolder: 'LE AN', cardType: 'DOMESTIC', cardProvider: 'fixture', cardLast4: '1234', cardExpMonth: 12, cardExpYear: 2030, transactionPinHash: await bcrypt.hash('123456', 4), transactionPinFailedAttempts: 0, transactionPinLockedUntil: null });
  const quote = await f.quote(1, PaymentMethod.CARD); const { order } = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  await assert.rejects(f.payment.confirmDemoCardPayment(1, order!.id, '000000'));
  assert.equal(f.rows(Order)[0].paymentStatus, 'UNPAID');
  const result = await f.payment.confirmDemoCardPayment(1, order!.id, '123456'); assert.equal(result.simulated, true);
  await f.payment.confirmDemoCardPayment(1, order!.id, '123456'); assert.equal(f.rows(Payment).length, 1); assert.equal(f.rows(Order)[0].paymentStatus, 'PAID');
});

test('HTTP: auth/DTO boundaries, durable replay in another ChatService, checkout SSE and Phase 1 work together', async t => {
  const f = fixture();
  let drafts = 0;
  const knowledge = { candidates: async () => [], reviewedOrPending: async () => null, retrieveContext: async () => [], saveDraft: async () => { drafts++; return { saved: true, autoApproved: true }; } };
  const module = await Test.createTestingModule({ controllers: [ChatController], providers: [ChatService, ChatShoppingService, IntentService, SmallTalkService, JwtStrategy,
    ...[[ChatCheckoutService, f.checkout], [ChatUserActionsService, f.userActions], [CartService, f.cart], [AddressesService, f.addresses], [ChatProductsService, f.products], [GeminiService, f.gemini], [ConfigService, f.config], [KnowledgeService, knowledge]].map(([provide, useValue]) => ({ provide, useValue })),
  ] }).compile();
  const app = module.createNestApplication({ logger: false }); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); t.after(() => app.close()); const base = await app.getUrl(); const jwt = new JwtService({ secret: 'checkout-fixture' });
  let sequence = 0;
  const post = (body: any, userId?: number, sse = false) => fetch(base + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sse ? { Accept: 'text/event-stream' } : {}), ...(userId ? { Authorization: 'Bearer ' + jwt.sign({ sub: userId, role: 'USER', email: `u${userId}@example.test` }) } : {}) }, body: JSON.stringify({ message: 'Thao tác', sessionId: 'http-checkout', requestId: `req${++sequence}`, ...body }), signal: AbortSignal.timeout(5000) });
  const anon: any = await (await post({ action: 'checkout_start', productId: 10 })).json(); assert.equal(anon.error.code, 'LOGIN_REQUIRED');
  for (const extra of [{ userId: 2 }, { pin: '123456' }, { address: { userId: 2 } }]) assert.equal((await post({ action: 'checkout_start', ...extra }, 1)).status, 400);
  const secret: any = await (await post({ message: 'PIN 123456', action: 'checkout_start' }, 1)).json(); assert.equal(secret.checkoutFlow, undefined);
  const response = await post({ action: 'checkout_start', productId: 10 }, 1, true); assert.equal(response.headers.get('content-type')?.includes('text/event-stream'), true);
  const event = JSON.parse((await response.text()).trim().slice(6)); assert.equal(event.type, 'result'); assert.equal(event.reply.checkoutFlow.stage, 'collecting_address'); assert.equal(f.rows(Order).length, 0);
  await post({ action: 'checkout_address', addressId: 101 }, 1); await post({ action: 'checkout_voucher', code: '' }, 1);
  const preview: any = await (await post({ action: 'checkout_payment', paymentMethod: 'CASH' }, 1)).json(); const quote = preview.checkoutFlow.quote;
  const body = { action: 'checkout_place_order', checkoutId: quote.id, quoteHash: quote.hash, requestId: 'confirm-once' };
  const first: any = await (await post(body, 1)).json();
  const retry = await f.makeChat().send('Thao tác', 'new-process', { id: 1 } as any, { message: 'Thao tác', sessionId: 'new-process', ...body } as any);
  assert.equal(retry.checkoutFlow?.order?.id, first.checkoutFlow.order.id); assert.equal(f.rows(Order).length, 1);
  const orders: any = await (await post({ action: 'orders_list' }, 1)).json(); assert.equal(orders.orders[0].id, first.checkoutFlow.order.id);
  const addresses: any = await (await post({ action: 'addresses_list' }, 1)).json(); assert.equal(addresses.addresses[0].userId, 1);
  assert.equal(drafts, 0, 'Private checkout must never enter shared knowledge');
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); t.after(() => finish()); let completed = false;
  (f.gemini as any).ai.models.generateContentStream = async function* () {
    yield { text: '{"intent":"general_question","confidence_score":90,"risk_level":"LOW","should_auto_approve":true,"answer":"Dùng màu be ' };
    await gate; completed = true; yield { text: 'để phòng thoáng hơn."}' };
  };
  const stream = await post({ message: 'Phòng nhỏ nên phối màu gì?' }, 1, true); const reader = stream.body!.getReader(); const decoder = new TextDecoder();
  let wire = decoder.decode((await reader.read()).value); assert.match(wire, /"type":"delta"/); assert.equal(completed, false); finish();
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; wire += decoder.decode(chunk.value, { stream: true }); }
  const events = wire.trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
  assert.equal(events.filter(event => event.type === 'delta').map(event => event.text).join(''), events.at(-1).reply.message); assert.equal(events.at(-1).type, 'result');
});

test('additive migration is repeatable and checks primary/unique constraints matching entity metadata', async () => {
  const { upgradeCheckout } = require('../../backend/scripts/setup-checkout.cjs');
  const statements: string[] = []; const columns = new Set(['id', 'order_id']); let indexed = false;
  const connection = { query: async (sql: string) => {
    statements.push(sql);
    if (sql === 'SHOW COLUMNS FROM payments') return [[...columns].map(Field => ({ Field }))];
    if (sql === 'SHOW COLUMNS FROM checkout_records') return [['id', 'user_id', 'snapshot', 'hash', 'state', 'order_id', 'expires_at', 'created_at'].map(Field => ({ Field }))];
    if (sql.startsWith('ALTER TABLE payments ADD COLUMN')) columns.add(sql.split(' ')[5]);
    if (sql.startsWith('ALTER TABLE payments ADD UNIQUE')) indexed = true;
    if (sql === 'SHOW INDEX FROM payments') return [indexed ? [{ Key_name: 'UQ_payment_payos_link', Non_unique: 0, Column_name: 'payos_link_id' }] : []];
    if (sql === 'SHOW INDEX FROM checkout_records') return [[{ Key_name: 'PRIMARY', Non_unique: 0, Column_name: 'id' }, { Key_name: 'UQ_checkout_order', Non_unique: 0, Column_name: 'order_id' }]];
    return [[]];
  } };
  await upgradeCheckout(connection); const firstCount = statements.filter(sql => sql.startsWith('ALTER')).length;
  await upgradeCheckout(connection); assert.equal(firstCount, 4); assert.equal(statements.filter(sql => sql.startsWith('ALTER')).length, firstCount);
  assert.ok(!statements.some(sql => /\b(DROP|TRUNCATE|DELETE)\b/i.test(sql)));
  assert.match(statements[0], /PRIMARY KEY \(id\)/); assert.match(statements[0], /ENGINE=InnoDB/);
  const metadata = getMetadataArgsStorage(); assert.ok(metadata.columns.some(column => column.target === CheckoutRecord && column.propertyName === 'id' && column.options.primary));
  assert.ok(metadata.indices.some(index => index.target === CheckoutRecord && index.name === 'UQ_checkout_order' && index.unique));
  assert.ok(metadata.indices.some(index => index.target === Payment && index.name === 'UQ_payment_payos_link' && index.unique));
});

test('promotion price uses exact integer rounding and event boundaries are start-inclusive/end-exclusive', () => {
  assert.equal(salePrice(2000000, 35), 1300000);
  assert.equal(salePrice(101, 50), 51);
  assert.equal(salePrice(999999999999999, 99), 10000000000000);
  for (const discount of [0, 100, -1, 1.5, NaN]) assert.throws(() => salePrice(1000, discount), BadRequestException);
  assert.throws(() => salePrice(1.5, 20), BadRequestException);
  const event = { status: 'published', startsAt: new Date(1000), endsAt: new Date(2000) };
  assert.equal(promotionPhase(event, new Date(999)), 'scheduled');
  assert.equal(promotionPhase(event, new Date(1000)), 'active');
  assert.equal(promotionPhase(event, new Date(2000)), 'ended');
  assert.equal(promotionPhase({ ...event, status: 'paused' }, new Date(1500)), 'paused');
});

function activateSale(f: ReturnType<typeof fixture>, discountPercent = 40) {
  const event = { id: 1, title: 'Ưu đãi kiểm thử', description: '', status: 'published', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 60000),
    items: [{ productId: 10, discountPercent }] };
  f.rows(Promotion).push(event);
  return event;
}

test('sale prices agree across cart and chatbot; pause/expiry restore original without writing it', async () => {
  const f = fixture(); const event = activateSale(f);
  const products = new ChatProductsService(f.repo(Product), f.promotions);
  await f.cart.add(1, 10, 2);
  const cart = await f.cart.get(1), product = await products.findById(10);
  assert.equal(cart.total, 600000); assert.equal(cart.saleSavings, 400000); assert.equal(cart.couponEligibleTotal, 0);
  assert.equal(cart.items[0].product.price, Number(product.price)); assert.equal(product.originalPrice, 500000);
  assert.equal(f.rows(Product)[0].price, '500000');
  event.status = 'paused'; assert.equal(Number((await products.findById(10)).price), 500000);
  event.status = 'published'; event.endsAt = new Date(0); assert.equal((await f.cart.get(1)).total, 1000000);
});

test('coupons apply only to regular lines and ignore a client-supplied inflated order amount', async () => {
  const f = fixture(); activateSale(f); f.rows(Coupon)[0].minOrderAmount = 0;
  await f.cart.add(1, 10, 1);
  await assert.rejects(f.coupons.validateCoupon('SALE10', 999999999, 1), /không thuộc sự kiện/);
  await f.cart.add(1, 20, 2);
  const validated = await f.coupons.validateCoupon('SALE10', 999999999, 1), quote = await f.quote(1, PaymentMethod.CASH, 'SALE10');
  assert.equal(validated.discountAmount, 40000); assert.equal(validated.finalAmount, 660000);
  assert.equal(quote.discountAmount, validated.discountAmount); assert.equal(quote.total, validated.finalAmount);
  const { order } = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  assert.equal(order!.items.find(item => item.productId === 10)!.price, 300000);
});

test('web checkout re-quotes expired/edited promotions, requires another click and persists the confirmed order amount', async () => {
  const f = fixture(); const event = activateSale(f);
  await f.cart.add(1, 10, 1);
  const input = { fullName: 'Người nhận', email: 'u1@example.test', phone: '0901111111', address: 'Hà Nội', paymentMethod: PaymentMethod.CASH, note: 'Gọi trước khi giao' };
  await assert.rejects(f.orders.create(1, input), ConflictException);
  const first = await f.orders.previewCheckout(1, input);
  assert.equal(first.total, 300000);
  event.endsAt = new Date(0);
  let replacement: any;
  await assert.rejects(f.orders.create(1, { ...input, quoteId: first.id, quoteHash: first.hash }), (error: any) => {
    assert.ok(error instanceof ConflictException); replacement = (error.getResponse() as any).quote; return true;
  });
  assert.equal(replacement.total, 500000); assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Product)[0].stock, 8);
  const accepted = await f.orders.create(1, { ...input, quoteId: replacement.id, quoteHash: replacement.hash });
  assert.equal(accepted.totalAmount, 500000); assert.equal(accepted.note, input.note);
  event.endsAt = new Date(Date.now() + 60000); event.items[0].discountPercent = 60;
  assert.equal((await f.orders.getOneForUser(1, accepted.id)).items[0].price, 500000);
  const replay = await f.orders.create(1, { ...input, quoteId: replacement.id, quoteHash: replacement.hash });
  assert.equal(replay.id, accepted.id); assert.equal(f.rows(Order).length, 1); assert.equal(f.rows(Product)[0].stock, 7);
});

test('web buy-one checkout charges only the selected line and preserves other cart lines on confirmation and replay', async () => {
  const f = fixture();
  await f.cart.add(1, 10, 1); await f.cart.add(1, 20, 2); await f.cart.add(2, 20, 1);
  f.rows(Coupon)[0].minOrderAmount = 300000;
  const input = { fullName: 'Người nhận', email: 'u1@example.test', phone: '0901111111', address: 'Hà Nội', paymentMethod: PaymentMethod.CASH, productId: 20, couponCode: 'SALE10' };
  const quote = await f.orders.previewCheckout(1, input);
  assert.deepEqual(quote.items.map(item => [item.productId, item.quantity]), [[20, 2]]);
  assert.equal(quote.productId, 20); assert.equal(quote.subtotal, 400000); assert.equal(quote.total, 360000);
  const coupon = await f.coupons.validateCoupon('SALE10', 999999999, 1, 20);
  assert.equal(coupon.discountAmount, quote.discountAmount); assert.equal(coupon.finalAmount, quote.total);
  await f.cart.update(1, 10, 3); f.rows(Product)[0].stock = 0;
  const request = { ...input, quoteId: quote.id, quoteHash: quote.hash };
  const order = await f.orders.create(1, request);
  assert.deepEqual(order.items.map(item => [item.productId, item.quantity]), [[20, 2]]);
  assert.equal(order.totalAmount, 360000); assert.equal(f.rows(Product)[1].stock, 8); assert.equal(f.rows(Product)[0].stock, 0);
  assert.deepEqual((await f.cart.get(1)).items.map(item => [item.productId, item.quantity]), [[10, 3]]);
  assert.equal((await f.cart.get(2)).itemCount, 1);
  assert.equal((await f.orders.create(1, request)).id, order.id);
  assert.equal(f.rows(Order).length, 1); assert.equal(f.rows(Payment).length, 1); assert.equal(f.rows(Coupon)[0].usedCount, 1);
  assert.equal((await f.cart.get(1)).itemCount, 3);
});

test('buy-one checkout rejects invalid, foreign and removed cart selections without consuming the remaining cart', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); await f.cart.add(2, 20, 1);
  const input = { addressId: 101, paymentMethod: PaymentMethod.CASH };
  for (const productId of [0, -1, 1.5, NaN, null, '10', 20, 999]) {
    await assert.rejects(f.orders.previewCheckout(1, { ...input, productId } as any), BadRequestException);
    await assert.rejects(f.coupons.validateCoupon('SALE10', 999999999, 1, productId as any), BadRequestException);
  }
  const quote = await f.orders.previewCheckout(1, { ...input, productId: 10 });
  await f.cart.add(1, 20, 1); await f.cart.remove(1, 10);
  await assert.rejects(f.orders.confirmCheckout(1, quote.id, quote.hash), /không có trong giỏ/);
  assert.deepEqual((await f.cart.get(1)).items.map(item => item.productId), [20]);
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Payment).length, 0); assert.equal(f.rows(Product)[0].stock, 8);
});

test('buy-one re-quotes keep the same product selection and never count unrelated lines for vouchers', async () => {
  const f = fixture(); await f.cart.add(1, 10, 1); await f.cart.add(1, 20, 2);
  await assert.rejects(f.coupons.validateCoupon('SALE10', 999999999, 1, 20), /tối thiểu/);
  await assert.rejects(f.orders.previewCheckout(1, { addressId: 101, paymentMethod: PaymentMethod.CASH, productId: 20, couponCode: 'SALE10' }), /tối thiểu/);
  const quote = await f.orders.previewCheckout(1, { addressId: 101, paymentMethod: PaymentMethod.CASH, productId: 20 });
  await f.cart.update(1, 20, 3); f.rows(Product)[1].price = '300000';
  const changed = await f.orders.confirmCheckout(1, quote.id, quote.hash);
  assert.equal(changed.changed, true); assert.equal(changed.quote?.productId, 20); assert.equal(changed.quote?.total, 900000);
  assert.deepEqual(changed.quote?.items.map(item => item.productId), [20]);
  const created = await f.orders.confirmCheckout(1, changed.quote!.id, changed.quote!.hash);
  assert.equal(created.order?.totalAmount, 900000);
  assert.deepEqual((await f.cart.get(1)).items.map(item => item.productId), [10]);
  const sale = fixture(); activateSale(sale); await sale.cart.add(1, 10, 1); await sale.cart.add(1, 20, 3);
  await assert.rejects(sale.coupons.validateCoupon('SALE10', 999999999, 1, 10), /không thuộc sự kiện/);
  await assert.rejects(sale.orders.previewCheckout(1, { addressId: 101, paymentMethod: PaymentMethod.CASH, productId: 10, couponCode: 'SALE10' }), /không thuộc sự kiện/);
  assert.equal((await sale.orders.previewCheckout(1, { addressId: 101, paymentMethod: PaymentMethod.CASH, productId: 10 })).total, 300000);
});

test('chat checkout promotion edits require re-confirmation and stock errors never create an order', async () => {
  const f = fixture(); const event = activateSale(f); await f.cart.add(1, 10, 1);
  const before = await f.quote(); event.items[0].discountPercent = 50;
  const changed = await f.orders.confirmCheckout(1, before.id, before.hash);
  assert.equal(changed.changed, true); assert.equal(changed.quote!.total, 250000); assert.equal(f.rows(Order).length, 0);
  f.rows(Product)[0].stock = 0;
  await assert.rejects(f.orders.confirmCheckout(1, changed.quote!.id, changed.quote!.hash), /tồn kho/);
  assert.equal(f.rows(Order).length, 0); assert.equal(f.rows(Payment).length, 0);
});
