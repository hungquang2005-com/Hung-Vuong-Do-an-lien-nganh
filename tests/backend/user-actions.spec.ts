import { PromotionsService } from '../../backend/src/promotions/promotions.service';
import { ChatCheckoutService } from '../../backend/src/chat/chat-checkout.service';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Cart } from '../../backend/src/database/entities/cart.entity';
import { CartItem } from '../../backend/src/database/entities/cart-item.entity';
import { Product } from '../../backend/src/database/entities/product.entity';
import { Favorite } from '../../backend/src/database/entities/favorite.entity';
import { UserAddress } from '../../backend/src/database/entities/user-address.entity';
import { Order } from '../../backend/src/database/entities/order.entity';
import { Coupon } from '../../backend/src/database/entities/coupon.entity';
import { CartService } from '../../backend/src/cart/cart.service';
import { OrdersService } from '../../backend/src/orders/orders.service';
import { FavoritesService } from '../../backend/src/favorites/favorites.service';
import { AddressesService } from '../../backend/src/addresses/addresses.service';
import { CouponsService } from '../../backend/src/coupon/coupons.service';
import { JwtStrategy } from '../../backend/src/auth/jwt.strategy';
import { ChatController } from '../../backend/src/chat/chat.controller';
import { ChatService } from '../../backend/src/chat/chat.service';
import { ChatShoppingService } from '../../backend/src/chat/chat-shopping.service';
import { ChatUserActionsService } from '../../backend/src/chat/chat-user-actions.service';
import { ChatProductsService, productQuery } from '../../backend/src/chat/chat-products.service';
import { KnowledgeService } from '../../backend/src/chat/knowledge.service';
import { IntentService } from '../../backend/src/chat/intent.service';
import { SmallTalkService } from '../../backend/src/chat/small-talk.service';
import { GeminiService } from '../../backend/src/chat/gemini.service';
import { normalizeText } from '../../backend/src/chat/chat-matching';
import { ChatReply } from '../../backend/src/chat/chat.types';

// Only in-memory repositories. This suite never connects to a database or loads .env.
function fixture() {
  const tables = new Map<any, any[]>([Cart, CartItem, Product, Favorite, UserAddress, Order, Coupon].map(entity => [entity, []]));
  const rows = (entity: any) => tables.get(entity)!;
  const match = (row: any, where: any): boolean => Array.isArray(where) ? where.some(w => match(row, w)) :
    Object.entries(where ?? {}).every(([key, value]: any) => value?._type === 'isNull' ? row[key] == null : row[key] === value);
  const repositories = new Map<any, any>();
  const repo = (entity: any): any => {
    if (repositories.has(entity)) return repositories.get(entity);
    const repository = {
      create: (data: any) => ({ ...data }),
      find: async ({ where, order }: any = {}) => {
        let found = rows(entity).filter(row => match(row, where)).map(row => ({ ...row }));
        if (entity === CartItem || entity === Favorite) found = found.map(row => ({ ...row, product: rows(Product).find(p => p.id === row.productId) }));
        for (const [key, direction] of Object.entries(order ?? {}).reverse()) found.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === 'DESC' ? -1 : 1));
        return found;
      },
      findOne: async (options: any) => (await repository.find(options))[0] ?? null,
      findOneOrFail: async (options: any) => { const row = await repository.findOne(options); if (!row) throw new NotFoundException(); return row; },
      findOneByOrFail: async (where: any) => repository.findOneOrFail({ where }),
      existsBy: async (where: any) => rows(entity).some(row => match(row, where)),
      save: async (data: any) => {
        const existing = rows(entity).find(row => row.id === data.id);
        if (existing) Object.assign(existing, data, { updatedAt: new Date() });
        else rows(entity).push({ ...data, id: Math.max(0, ...rows(entity).map(row => row.id)) + 1, createdAt: new Date(), updatedAt: new Date() });
        return existing ?? rows(entity).at(-1);
      },
      upsert: async (data: any) => { if (!rows(entity).some(row => match(row, data))) await repository.save(data); },
      update: async (where: any, data: any) => { rows(entity).filter(row => match(row, where)).forEach(row => Object.assign(row, data)); },
      delete: async (where: any) => { const source = rows(entity); for (let i = source.length - 1; i >= 0; i--) if (match(source[i], where)) source.splice(i, 1); },
      remove: async (data: any) => repository.delete({ id: data.id }),
      manager: { transaction: async (work: any) => work({ getRepository: repo }) },
    };
    repositories.set(entity, repository); return repository;
  };
  rows(Product).push(...[
    { id: 10, name: 'Bàn gỗ', price: '500000', stock: 8 },
    { id: 20, name: 'Bàn trắng', price: '800000', stock: 6 },
    { id: 30, name: 'Bàn lớn', price: '1200000', stock: 0 },
  ].map(p => ({ ...p, category: 'Bàn', brand: null, imageUrl: null, isFeatured: false, description: null, specifications: null, origin: null })));
  rows(Order).push(...[
    { id: 502, userId: 1, createdAt: new Date('2026-10-02'), status: 'CONFIRMED', paymentStatus: 'PAID' },
    { id: 501, userId: 1, createdAt: new Date('2026-10-01'), status: 'PENDING', paymentStatus: 'UNPAID' },
    { id: 999, userId: 2, createdAt: new Date('2026-10-03'), status: 'PENDING', paymentStatus: 'UNPAID' },
  ].map(o => ({ ...o, totalAmount: '500000', subtotalAmount: '500000', fullName: `User ${o.userId}`, phone: '0900000000', address: 'Địa chỉ riêng', items: [] })));
  rows(UserAddress).push(...[
    { id: 101, userId: 1, fullName: 'Nguyễn Văn An', phone: '0901111111', address: '10 Nguyễn Trãi, Hà Nội', isDefault: true },
    { id: 102, userId: 1, fullName: 'Nguyễn Văn An', phone: '0902222222', address: '20 Lê Lợi, Hà Nội', isDefault: false },
    { id: 201, userId: 2, fullName: 'User 2', phone: '0903333333', address: 'Địa chỉ của user 2', isDefault: true },
  ].map(a => ({ ...a, createdAt: new Date(), updatedAt: new Date() })));
  rows(Coupon).push({ id: 1, userId: null, code: 'MIN1M', discountType: 'percentage', discountValue: 10, minOrderAmount: 1000000,
    maxDiscountAmount: 200000, usageLimit: 10, usedCount: 0, isActive: true, startDate: new Date(Date.now() - 86400000), endDate: new Date(Date.now() + 86400000), freeShipping: false },
    { id: 2, userId: 2, code: 'PRIVATE2', isActive: true });
  const products: any = {
    findById: async (id: number) => { const product = rows(Product).find(p => p.id === id); if (!product) throw new NotFoundException('Không tìm thấy sản phẩm'); return product; },
    context: async (message: string) => {
      const query = productQuery(message);
      if (!query.related) return null;
      return { hash: 'fixture', keyword: query.keyword, products: rows(Product).filter(p => query.terms.every(term => normalizeText(p.name).includes(term)) && (query.includeOutOfStock || p.stock > 0)) };
    },
  };
  const promotions = new PromotionsService({ manager: {} } as any); promotions.active = async () => null;
  const cart = new CartService(repo(Cart), repo(CartItem), promotions);
  const orders = new OrdersService({} as any, repo(Order), ...Array(7).fill({}) as [any, any, any, any, any, any, any]);
  const favorites = new FavoritesService(repo(Favorite), { findOne: products.findById, publicProduct: (p: any) => ({ ...p, price: Number(p.price) }) } as any);
  const addresses = new AddressesService(repo(UserAddress));
  const coupons = new CouponsService(repo(Coupon), cart);
  return { rows, products, cart, orders, favorites, addresses, coupons };
}

test('phase 1 HTTP: real business services over isolated fixtures', async t => {
  const f = fixture();
  const module = await Test.createTestingModule({ controllers: [ChatController], providers: [{ provide: ChatCheckoutService, useValue: { handle: async () => null } }, ChatService, ChatShoppingService, ChatUserActionsService,
    IntentService, SmallTalkService, GeminiService, JwtStrategy,
    { provide: CartService, useValue: f.cart }, { provide: OrdersService, useValue: f.orders },
    { provide: FavoritesService, useValue: f.favorites }, { provide: AddressesService, useValue: f.addresses },
    { provide: CouponsService, useValue: f.coupons }, { provide: ChatProductsService, useValue: f.products },
    { provide: KnowledgeService, useValue: { candidates: async () => [], reviewedOrPending: async () => null,
      retrieveContext: async () => [], saveDraft: async () => ({ saved: true, autoApproved: true }) } },
    { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'phase1-fixture', GEMINI_API_KEY: 'fixture-only' }) },
  ] }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1'); t.after(() => app.close());
  const base = await app.getUrl(); const jwt = new JwtService({ secret: 'phase1-fixture' });
  const gemini = module.get(GeminiService);
  let interpretations = 0;
  gemini.interpretAction = async message => { interpretations++; return message.includes('đánh dấu') ? { action: 'favorites_list' } : null; };
  let sequence = 0;
  const post = (body: any, userId?: number, accept?: string) => fetch(base + '/chat', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accept ? { Accept: accept } : {}), ...(userId ? { Authorization: 'Bearer ' + jwt.sign({ sub: userId, role: 'USER', email: `u${userId}@example.test` }) } : {}) },
    body: JSON.stringify({ message: 'Thao tác', sessionId: 'phase1', requestId: `r-${++sequence}`, ...body }), signal: AbortSignal.timeout(5000) });
  const chat = async (body: any, userId = 1): Promise<ChatReply> => { const response = await post(body, userId); assert.equal(response.status, 201); return response.json() as Promise<ChatReply>; };

  await t.test('anonymous orders and spoofed userId / nested DTO are rejected', async () => {
    const result: any = await (await post({ message: 'Xem lịch sử đơn hàng' })).json();
    assert.equal(result.error.code, 'LOGIN_REQUIRED'); assert.equal(result.orders, undefined);
    assert.equal((await post({ action: 'orders_list', userId: 2 }, 1)).status, 400);
    assert.equal((await post({ action: 'address_create', address: { fullName: 'A', phone: 123, userId: 2 } }, 1)).status, 400);
    assert.equal((await post({ action: 'cart_add_many', items: [{ productId: 10, quantity: -1 }] }, 1)).status, 400);
  });
  await t.test('order ownership, separate ordinal lists, recent order and contextual payment lookup', async () => {
    assert.equal((await chat({ action: 'order_detail', orderId: 999 })).error?.code, 'FORBIDDEN');
    assert.equal((await chat({ action: 'order_detail', orderId: 12345 })).error?.code, 'NOT_FOUND');
    assert.deepEqual((await chat({ message: 'Xem lịch sử đơn hàng' })).orders?.map(o => o.id), [502, 501]);
    const products = await chat({ message: 'Tìm bàn' }); assert.equal(products.products?.[1].id, 20);
    const order = await chat({ message: 'Đơn thứ hai đang ở trạng thái nào?' });
    assert.equal(order.orders?.[0].id, 501); assert.equal(order.orders?.[0].status, 'PENDING');
    assert.equal((await chat({ message: 'Đơn hàng này đã thanh toán chưa?' })).orders?.[0].paymentStatus, 'UNPAID');
    assert.equal((await chat({ message: 'Cho tôi xem chi tiết đơn hàng gần nhất', sessionId: 'fresh' })).orders?.[0].id, 502);
    assert.equal((await chat({ message: 'Đơn thứ hai thế nào?', sessionId: 'another-account' }, 2)).orders, undefined);
  });
  await t.test('favorites reuse services; semantic interpretation handles a paraphrase; missing product fails', async () => {
    assert.equal((await chat({ action: 'favorite_add', productId: 10 })).favorites?.[0].productId, 10);
    assert.equal((await chat({ message: 'Liệt kê những món tôi đã đánh dấu' })).favorites?.[0].productId, 10);
    assert.ok(interpretations > 0);
    assert.equal((await chat({ message: 'Xem danh sách yêu thích có Bàn gỗ' })).favorites?.length, 1);
    await chat({ message: 'Không bỏ Bàn gỗ khỏi yêu thích' });
    assert.equal((await f.favorites.list(1)).length, 1);
    assert.equal((await chat({ action: 'favorite_add', productId: 9999 })).error?.code, 'NOT_FOUND');
    assert.equal((await chat({ message: 'Bỏ sản phẩm thứ nhất khỏi yêu thích' })).favorites?.length, 0);
    assert.equal((await chat({ action: 'favorites_list' }, 2)).favorites?.length, 0);
  });
  await t.test('address ownership, form collection, real defaults and deletion confirmation', async () => {
    for (const action of ['address_update', 'address_delete', 'address_default']) assert.equal((await chat({ action, addressId: 201, address: { phone: '0909999999' } })).error?.code, 'NOT_FOUND');
    await assert.rejects(() => f.addresses.update(1, 201, { phone: '0909999999' }), NotFoundException);
    await assert.rejects(() => f.addresses.remove(1, 201), NotFoundException);
    assert.equal(f.rows(UserAddress).find(a => a.id === 201).phone, '0903333333');
    const missing = await chat({ message: 'Thêm địa chỉ giao hàng', sessionId: 'new-address' });
    assert.deepEqual(missing.addressForm?.missingFields, ['fullName', 'phone', 'address']);
    assert.equal(f.rows(UserAddress).length, 3);
    await chat({ message: 'Lưu địa chỉ mới', action: 'address_create', address: { fullName: '  Lê Ánh  ', phone: '0905555555', address: '15 Huế, Hà Nội' }, sessionId: 'new-address' });
    assert.ok(f.rows(UserAddress).some(a => a.fullName === 'Lê Ánh'));
    const updated = await chat({ action: 'address_update', addressId: 102, address: { phone: '0907777777' } });
    assert.equal(updated.addresses?.find(a => a.id === 102)?.phone, '0907777777');
    const defaults = await chat({ action: 'address_default', addressId: 102 });
    assert.deepEqual(defaults.addresses?.filter(a => a.isDefault).map(a => a.id), [102]);
    const target = defaults.addresses![1];
    const preview = await chat({ message: 'Xóa địa chỉ thứ hai' });
    assert.ok(preview.confirmation?.summary.includes(target.address));
    assert.ok(f.rows(UserAddress).some(a => a.id === target.id));
    const stale = await chat({ action: 'action_confirm', confirmationId: 'wrong-id' }); assert.equal(stale.addresses, undefined);
    const done = await chat({ action: 'action_confirm', confirmationId: preview.confirmation!.id });
    assert.ok(!done.addresses?.some(a => a.id === target.id));
  });
  await t.test('multi-add is atomic, rejects missing/ambiguous/out-of-stock products and replays once', async () => {
    await f.cart.clear(1);
    const failed = await chat({ action: 'cart_add_many', items: [{ productId: 10, quantity: 1 }, { productId: 30, quantity: 1 }] });
    assert.equal(failed.error?.code, 'VALIDATION_ERROR'); assert.equal((await f.cart.get(1)).itemCount, 0);
    assert.equal((await chat({ action: 'cart_add_many', items: [{ productId: 9999, quantity: 1 }] })).error?.code, 'NOT_FOUND');
    assert.equal((await chat({ message: 'Thêm 2 bàn vào giỏ', action: 'cart_add_many' })).error?.code, 'VALIDATION_ERROR');
    const request = { message: 'Thêm 2 Bàn gỗ và 1 Bàn trắng vào giỏ', requestId: 'batch-once' };
    const [first, second] = await Promise.all([chat(request), chat(request)]);
    assert.equal(first.cart?.total, 1800000); assert.deepEqual(first, second); assert.equal((await f.cart.get(1)).itemCount, 3);
  });
  await t.test('Vietnamese quantities and existing natural cart update/removal run through the new adapter', async () => {
    await f.cart.clear(1);
    const added = await chat({ message: 'Thêm hai Bàn gỗ và một Bàn trắng vào giỏ', sessionId: 'words' });
    assert.equal(added.cart?.itemCount, 3);
    const updated = await chat({ message: 'Đổi số lượng sản phẩm Bàn trắng thành 3', sessionId: 'words' });
    assert.equal(updated.cart?.total, 3400000);
    const removed = await chat({ message: 'Xóa Bàn gỗ khỏi giỏ', sessionId: 'words' });
    assert.equal(removed.cart?.items.length, 1); assert.equal(removed.cart?.total, 2400000);
  });
  await t.test('contextual address edits and favorite ordinals cannot target stale product/cart lists', async () => {
    const sessionId = 'contexts';
    const list = await chat({ action: 'addresses_list', sessionId });
    const edit = await chat({ message: 'Sửa cái thứ hai', sessionId });
    assert.equal(edit.addressForm?.addressId, list.addresses?.[1].id);
    assert.ok((await chat({ message: 'Xem giỏ', sessionId })).cart);
    assert.equal((module.get(ChatService) as any).sessions.get('user:1:contexts').addressDraft, undefined);
    await chat({ message: 'Tìm bàn', sessionId });
    await chat({ message: 'Thêm Bàn gỗ vào yêu thích', sessionId });
    const favorites = await chat({ message: 'Thêm Bàn trắng vào yêu thích', sessionId });
    assert.equal(favorites.favorites?.length, 2);
    await f.cart.clear(1);
    const fromFavorites = await chat({ message: 'Thêm cái thứ hai vào giỏ', sessionId });
    assert.equal(fromFavorites.cart?.items[0].productId, favorites.favorites?.[1].productId);
    const preview = await chat({ action: 'address_delete', addressId: 101, sessionId });
    assert.ok(preview.confirmation);
    await f.addresses.update(1, 101, { phone: '0908888888' });
    const stale = await chat({ action: 'action_confirm', confirmationId: preview.confirmation!.id, sessionId });
    assert.equal(stale.addresses, undefined); assert.ok(f.rows(UserAddress).some(a => a.id === 101));
  });
  await t.test('active voucher eligibility uses current cart total and never says applied', async () => {
    await f.cart.clear(1); await f.cart.add(1, 10, 1);
    const low = await chat({ message: 'Voucher nào đang dùng được?' });
    assert.equal(low.coupons?.length, 1); assert.equal(low.coupons?.[0].active, true); assert.equal(low.coupons?.[0].eligible, false);
    assert.match(low.coupons![0].reason, /tối thiểu/); assert.match(low.message, /Chưa áp dụng/);
    await f.cart.add(1, 10, 1);
    const eligible = await chat({ action: 'coupon_detail', code: 'MIN1M' });
    assert.equal(eligible.coupons?.[0].discountAmount, 100000); assert.equal(eligible.coupons?.[0].finalAmount, 900000);
    assert.equal((await chat({ action: 'coupon_detail', code: 'PRIVATE2' })).error?.code, 'VALIDATION_ERROR');
  });
  await t.test('clear cart requires confirmation; snapshot changes, cancellation, replay and session isolation', async () => {
    await f.cart.clear(1); await f.cart.add(1, 10, 2);
    const preview = await chat({ message: 'Xóa toàn bộ giỏ hàng' });
    assert.ok(preview.confirmation); assert.equal((await f.cart.get(1)).itemCount, 2);
    const other = await chat({ action: 'action_confirm', confirmationId: preview.confirmation!.id }, 2);
    assert.equal(other.cart, undefined); assert.equal((await f.cart.get(1)).itemCount, 2);
    await f.cart.add(1, 20, 1);
    assert.equal((await chat({ action: 'action_confirm', confirmationId: preview.confirmation!.id })).error?.code, 'VALIDATION_ERROR');
    assert.equal((await f.cart.get(1)).itemCount, 3);
    await chat({ action: 'cart_clear' }); await chat({ message: 'không' });
    assert.equal((await chat({ message: 'xác nhận' })).cart, undefined);
    const fresh = await chat({ action: 'cart_clear' });
    const options = { action: 'action_confirm', confirmationId: fresh.confirmation!.id, requestId: 'clear-once' };
    assert.equal((await chat(options)).cart?.itemCount, 0);
    await f.cart.add(1, 10, 1);
    await chat(options); assert.equal((await f.cart.get(1)).itemCount, 1);
  });
  await t.test('credentials never enter interpreter, shared knowledge or request history', async () => {
    const before = interpretations;
    await chat({ message: 'OTP của tôi là 123456', sessionId: 'secrets' });
    const sessions: Map<string, any> = (module.get(ChatService) as any).sessions;
    assert.equal(sessions.has('user:1:secrets'), false); assert.equal(interpretations, before);
  });
  await t.test('new action emits structured SSE; subsequent genuine Gemini stream emits before finishing', async () => {
    const orders = await post({ action: 'orders_list', sessionId: 'sse' }, 1, 'text/event-stream');
    const resultEvent = JSON.parse((await orders.text()).trim().slice(6));
    assert.equal(resultEvent.type, 'result'); assert.equal(resultEvent.reply.orders[0].id, 502);
    let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; });
    t.after(() => finish());
    let completed = false;
    (gemini as any).ai.models.generateContentStream = async function* () {
      yield { text: '{"intent":"general_question","confidence_score":90,"risk_level":"LOW","should_auto_approve":true,"answer":"Dùng màu be ' };
      await gate; completed = true; yield { text: 'để phòng thoáng hơn."}' };
    };
    const response = await post({ message: 'Phòng nhỏ nên phối màu gì?', sessionId: 'sse' }, 1, 'text/event-stream');
    const reader = response.body!.getReader(); const decoder = new TextDecoder();
    let wire = decoder.decode((await reader.read()).value);
    assert.match(wire, /"type":"delta"/); assert.equal(completed, false); finish();
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; wire += decoder.decode(chunk.value, { stream: true }); }
    const events = wire.trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), events.at(-1).reply.message);
    assert.equal(events.at(-1).type, 'result');
  });
});

test('Gemini interpreter accepts structured supported actions and rejects malformed / invented actions', async () => {
  const gemini = new GeminiService(new ConfigService({ GEMINI_API_KEY: 'fixture-only' }));
  let output: any = { action: 'cart_add_many', items: [{ query: 'Bàn gỗ', quantity: 2 }] };
  (gemini as any).ai.models.generateContent = async (request: any) => {
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.ok(!request.contents.includes('userId'));
    return { text: JSON.stringify(output) };
  };
  assert.equal((await gemini.interpretAction('Thêm hai Bàn gỗ'))?.items?.[0].quantity, 2);
  for (const invalid of [{ action: 'delete_all_users' }, { action: 'action_confirm' }, { action: 'cart_add_many', items: [{ query: 'Bàn', quantity: -2 }] }, { action: 'order_detail', ordinal: 0 }, { action: null }]) {
    output = invalid; assert.equal(await gemini.interpretAction('kiểm thử'), null);
  }
});
