import { PromotionsService } from '../../backend/src/promotions/promotions.service';
import { ChatCheckoutService } from '../../backend/src/chat/chat-checkout.service';
import { ChatUserActionsService } from '../../backend/src/chat/chat-user-actions.service';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CartService } from '../../backend/src/cart/cart.service';
import { CartController } from '../../backend/src/cart/cart.controller';
import { Cart } from '../../backend/src/database/entities/cart.entity';
import { CartItem } from '../../backend/src/database/entities/cart-item.entity';
import { Product } from '../../backend/src/database/entities/product.entity';
import { AddressesService } from '../../backend/src/addresses/addresses.service';
import { JwtStrategy } from '../../backend/src/auth/jwt.strategy';
import { ChatController } from '../../backend/src/chat/chat.controller';
import { ChatService } from '../../backend/src/chat/chat.service';
import { ChatShoppingService } from '../../backend/src/chat/chat-shopping.service';
import { ChatProductsService, productQuery } from '../../backend/src/chat/chat-products.service';
import { IntentService, requestedQuantity, selectedOrdinal } from '../../backend/src/chat/intent.service';
import { SmallTalkService } from '../../backend/src/chat/small-talk.service';
import { KnowledgeService } from '../../backend/src/chat/knowledge.service';
import { GeminiService } from '../../backend/src/chat/gemini.service';
import { ShoppingSession } from '../../backend/src/chat/chat-shopping.service';

function cartFixture() {
  const products = [
    { id: 10, name: 'Bàn học gỗ', category: 'Bàn học', price: '500000', stock: 8 },
    { id: 20, name: 'Bàn học trắng', category: 'Bàn học', price: '800000', stock: 6 },
    { id: 30, name: 'Bàn học lớn', category: 'Bàn học', price: '1200000', stock: 0 },
  ].map(product => ({ brand: null, description: null, specifications: null, origin: null, imageUrl: null, isFeatured: false, ...product })) as Product[];
  const carts: Cart[] = [];
  const rows: CartItem[] = [];
  const locks: unknown[] = [];
  let saves = 0;
  let failSave = false;
  const match = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  const cartRepo: any = {
    findOne: async ({ where }: any) => carts.find(row => match(row, where)) ?? null,
    findOneOrFail: async ({ where, lock }: any) => { locks.push(lock); const row = carts.find(row => match(row, where)); assert.ok(row); return row; },
    create: (data: any) => data,
    save: async (data: any) => { const cart = { ...data, id: carts.length + 1 }; carts.push(cart); return cart; },
  };
  const itemRepo: any = {
    find: async ({ where }: any) => rows.filter(row => match(row, where)).map(row => ({ ...row, product: products.find(product => product.id === row.productId) })),
    findOne: async ({ where }: any) => { const row = rows.find(row => match(row, where)); return row ? { ...row } : null; },
    create: (data: any) => data,
    save: async (data: any) => {
      if (failSave) throw new Error('simulated repository failure');
      saves++;
      const row = rows.find(row => row.id === data.id);
      if (row) Object.assign(row, data); else rows.push({ ...data, id: rows.length + 1 });
      return data;
    },
    delete: async (where: any) => { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], where)) rows.splice(i, 1); },
  };
  const productRepo = { findOne: async ({ where, lock }: any) => { locks.push(lock); return products.find(row => match(row, where)) ?? null; } };
  const manager = { getRepository: (entity: unknown) => entity === Cart ? cartRepo : entity === CartItem ? itemRepo : productRepo };
  cartRepo.manager = { transaction: async (work: any) => work(manager) };
  const promotions = new PromotionsService({ manager: {} } as any); promotions.active = async () => null;
  return { products, rows, locks, cart: new CartService(cartRepo, itemRepo, promotions), saves: () => saves, fail: (value: boolean) => { failSave = value; } };
}

test('shopping intent and Vietnamese references/quantities', () => {
  const intents = new IntentService(new SmallTalkService());
  const examples = {
    'Tôi lấy cái thứ hai.': 'product_select', 'Thêm cho tôi hai cái.': 'cart_add',
    'Bỏ sản phẩm vừa chọn đi.': 'cart_remove', 'Tôi muốn xem lại giỏ.': 'cart_view',
    'Đổi số lượng thành 3': 'cart_update_quantity', 'Mua luôn sản phẩm này.': 'buy_now',
    'Tôi muốn mua ngay': 'buy_now', 'Cho xem lại thông tin mua hàng': 'checkout_review',
  };
  for (const [message, intent] of Object.entries(examples)) {
    assert.equal(intents.classify(message).intent, intent, message);
    assert.equal(intents.classify(message).shouldStore, false, message);
  }
  assert.equal(selectedOrdinal('Tôi chọn chiếc thứ hai'), 2);
  assert.equal(selectedOrdinal('Chọn cái thứ 12'), 12);
  assert.equal(requestedQuantity('Thêm cho tôi hai cái'), 2);
  assert.equal(requestedQuantity('Đổi số lượng thành 3'), 3);
  assert.equal(requestedQuantity('Thêm -2 cái'), -2);
  assert.equal(requestedQuantity('Thêm 1,5 cái'), 1.5);
  assert.equal(requestedQuantity('Tôi chọn chiếc thứ hai'), undefined);
});

test('shared CartService validates input, stock, ownership, totals and locks writes', async () => {
  const fixture = cartFixture();
  const { cart } = fixture;
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(() => cart.add(1, 10, quantity), BadRequestException);
    await assert.rejects(() => cart.update(1, 10, quantity), BadRequestException);
  }
  await assert.rejects(() => cart.add(1, 999, 1), NotFoundException);
  await assert.rejects(() => cart.add(1, 30, 1), BadRequestException);
  await assert.rejects(() => cart.add(1, 10, 9), BadRequestException);
  assert.equal((await cart.add(1, 10, 2)).total, 1000000);
  await assert.rejects(() => cart.add(1, 10, 7), BadRequestException);
  await assert.rejects(() => cart.update(2, 10, 1), NotFoundException);
  assert.equal((await cart.remove(2, 10)).total, 0);
  assert.equal((await cart.get(1)).itemCount, 2);
  assert.equal((await cart.update(1, 10, 3)).total, 1500000);
  assert.ok(fixture.locks.some((lock: any) => lock?.mode === 'pessimistic_write'));
  assert.ok(fixture.locks.some((lock: any) => lock?.mode === 'pessimistic_read'));
});

test('shopping HTTP integrates authenticated chat with the regular cart API', async t => {
  const fixture = cartFixture();
  const { cart, products } = fixture;
  const productService = {
    findById: async (id: number) => { const product = products.find(product => product.id === id); if (!product) throw new NotFoundException('Không tìm thấy sản phẩm'); return product; },
    context: async (message: string) => {
      const query = productQuery(message);
      if (!query.related) return null;
      return { keyword: 'ban hoc', hash: 'test-catalog', products: products.filter(p => (query.maxPrice === undefined || Number(p.price) <= query.maxPrice) &&
        (query.includeOutOfStock || p.stock > 0) && !message.includes('không tồn tại')) };
    },
  };
  const addresses = { list: async (userId: number) => [{ id: userId * 100, userId, fullName: `Người dùng ${userId}`, phone: '0900000000', address: 'Địa chỉ đã lưu', isDefault: true }] };
  const module = await Test.createTestingModule({
    controllers: [ChatController, CartController],
    providers: [{ provide: ChatCheckoutService, useValue: { handle: async () => null } }, { provide: ChatUserActionsService, useValue: { handle: async () => null } }, ChatService, ChatShoppingService, IntentService, SmallTalkService, JwtStrategy,
      { provide: CartService, useValue: cart }, { provide: ChatProductsService, useValue: productService },
      { provide: AddressesService, useValue: addresses },
      { provide: KnowledgeService, useValue: { candidates: async () => [], reviewedOrPending: async () => null } },
      { provide: GeminiService, useValue: { draft: () => assert.fail('Shopping must never call Gemini') } },
      { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: 'shopping-test-only' }) }],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const base = await app.getUrl();
  const jwt = new JwtService({ secret: 'shopping-test-only' });
  let seq = 0;
  const request = async (path: string, body?: unknown, userId?: number, credential?: string) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json',
      ...(userId ? { Authorization: 'Bearer ' + jwt.sign({ sub: userId, email: `u${userId}@example.test`, role: 'USER' }) } : {}),
      ...(credential ? { Authorization: credential } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() as any };
  };
  const send = (message: string, options: Record<string, unknown> = {}, userId?: number) => request('/chat', { message, sessionId: 'main', requestId: `req-${++seq}`, ...options }, userId);

  await t.test('DTO and credentials reject spoofed input; anonymous browsing remains public', async () => {
    assert.equal((await request('/chat', { message: 'Xin chào' }, undefined, 'Bearer broken')).status, 401);
    for (const extra of [{ userId: 2 }, { price: 1 }, { quantity: 0 }, { quantity: 1.5 }, { productId: -2 }, { action: 'create_order' }]) {
      assert.equal((await send('Thêm vào giỏ', extra, 1)).status, 400);
    }
    assert.equal((await send('Tìm bàn học dưới 1 triệu')).data.products.length, 2);
    assert.equal((await send('Tôi chọn cái thứ hai')).data.products[0].id, 20);
    for (const message of ['Thêm vào giỏ hàng', 'Tôi muốn xem lại giỏ', 'Mua ngay']) {
      assert.equal((await send(message)).data.error.code, 'LOGIN_REQUIRED');
    }
    assert.equal((await request('/cart')).status, 401);
    assert.equal(fixture.saves(), 0);
  });

  await t.test('latest search order, exact selection, natural add/update/view and API totals agree', async () => {
    const isolated = await send('Tôi chọn cái thứ hai', {}, 1);
    assert.equal(isolated.data.products, undefined); // guest context is isolated
    assert.match(isolated.data.message, /kết quả gần nhất/);
    await send('Tìm bàn học dưới 1 triệu', {}, 1);
    assert.equal((await send('Tôi lấy cái thứ hai', {}, 1)).data.products[0].id, 20);
    const added = await send('Thêm cho tôi hai cái', {}, 1);
    assert.equal(added.data.cart.items[0].productId, 20);
    assert.equal(added.data.cart.total, 1600000);
    assert.equal((await send('Sản phẩm này còn hàng không?', {}, 1)).data.products[0].id, 20);
    assert.deepEqual((await send('So sánh các sản phẩm này', {}, 1)).data.products.map((p: any) => p.id), [10, 20]);
    assert.equal((await send('Đổi số lượng thành 3', {}, 1)).data.cart.itemCount, 3);
    assert.match((await send('Đổi số lượng', {}, 1)).data.message, /bao nhiêu chiếc/);
    assert.equal((await send('3', {}, 1)).data.cart.itemCount, 3);
    const view = await send('Tôi muốn xem lại giỏ', {}, 1);
    assert.deepEqual(view.data.cart, (await request('/cart', undefined, 1)).data);
    assert.equal((await send('Xem giỏ hàng', {}, 2)).data.cart.total, 0);
    assert.match((await send('Thêm vào giỏ', { productId: 20 }, 2)).data.message, /danh sách/);
    assert.equal((await request('/cart', undefined, 1)).data.total, 2400000);
  });

  await t.test('invalid quantities, stale/missing products and failures never claim success', async () => {
    for (const message of ['Thêm -2 cái', 'Thêm 1,5 cái', 'Thêm 0 cái', 'Thêm 9 cái']) {
      const result = await send(message, {}, 1);
      assert.equal(result.status, 400, message);
      assert.ok(!result.data.message.includes('Đã thêm'));
    }
    assert.match((await send('Chọn cái thứ 9', {}, 1)).data.message, /vị trí/);
    assert.match((await send('Thêm vào giỏ', { productId: 999 }, 1)).data.message, /danh sách/);
    const original = productService.findById;
    productService.findById = async () => { throw new NotFoundException('Không tìm thấy sản phẩm'); };
    assert.equal((await send('Mua ngay', {}, 1)).status, 404);
    productService.findById = original;
    fixture.fail(true);
    assert.equal((await send('Thêm 1 cái', {}, 1)).status, 500);
    fixture.fail(false);
    assert.equal((await request('/cart', undefined, 1)).data.itemCount, 3);
  });

  await t.test('same requestId is applied once, including simultaneous requests', async () => {
    const before = fixture.saves();
    const results = await Promise.all([send('Thêm 1 cái', { requestId: 'same-operation' }, 1), send('Thêm 1 cái', { requestId: 'same-operation' }, 1)]);
    assert.equal(results[0].status, 201);
    assert.deepEqual(results[0].data, results[1].data);
    assert.equal(fixture.saves(), before + 1);
    assert.equal((await send('Thêm 2 cái', { requestId: 'same-operation' }, 1)).status, 400);
  });

  await t.test('buy-now preview includes existing cart; explicit confirmation rechecks facts and never creates an order', async () => {
    await cart.add(1, 10, 1);
    const before = fixture.saves();
    const preview = await send('Mua ngay 2 cái', {}, 1);
    assert.equal(preview.data.checkout.quantity, 2);
    assert.equal(preview.data.checkout.total, 2100000);
    assert.equal(preview.data.checkout.addresses[0].id, 100);
    assert.equal(fixture.saves(), before);
    const stale = await send('Xác nhận', { action: 'checkout_confirm', reviewId: 'old' }, 1);
    assert.ok(!stale.data.checkoutUrl);
    const foreignAddress = await send('Chọn địa chỉ', { action: 'checkout_review', reviewId: preview.data.checkout.id, addressId: 200 }, 1);
    assert.equal(foreignAddress.status, 400);
    products[1].price = '850000';
    const changed = await send('Xác nhận', { action: 'checkout_confirm', reviewId: preview.data.checkout.id }, 1);
    assert.equal(changed.data.checkout.total, 2200000);
    assert.ok(!changed.data.checkoutUrl);
    const confirmed = await send('Xác nhận', { action: 'checkout_confirm', reviewId: changed.data.checkout.id, requestId: 'confirm-operation' }, 1);
    assert.equal(confirmed.data.checkout.confirmed, true);
    assert.equal(confirmed.data.checkoutUrl, '/checkout/info');
    assert.equal(confirmed.data.cart.total, 2200000);
    const again = await send('Xác nhận', { action: 'checkout_confirm', reviewId: changed.data.checkout.id, requestId: 'confirm-operation' }, 1);
    assert.deepEqual(again.data, confirmed.data);
    assert.equal(fixture.saves(), before + 1);
    products[1].price = '800000';
  });

  await t.test('new search replaces selection, cheaper search uses current product and removal uses owned cart', async () => {
    await send('Tìm bàn học dưới 600k', {}, 1);
    assert.match((await send('Thêm vào giỏ', {}, 1)).data.message, /sản phẩm nào/);
    await send('Chọn cái thứ nhất', {}, 1);
    const cheaper = await send('Có mẫu nào rẻ hơn không?', {}, 1);
    assert.equal(cheaper.data.products.length, 0);
    assert.match((await send('Chọn cái thứ nhất', {}, 1)).data.message, /vị trí/);
    await send('Tìm bàn học dưới 1 triệu', {}, 1);
    await send('Chọn cái thứ hai', {}, 1);
    const removed = await send('Bỏ sản phẩm vừa chọn đi', {}, 1);
    assert.equal(removed.data.cart.items.some((item: any) => item.productId === 20), false);
    assert.deepEqual(removed.data.cart, (await request('/cart', undefined, 1)).data);
  });

  await t.test('expired sessions and expired tokens cannot reuse a previous selection', async () => {
    await send('Tìm bàn học dưới 1 triệu', { sessionId: 'expired' }, 1);
    await send('Chọn cái thứ hai', { sessionId: 'expired' }, 1);
    const sessions: Map<string, { expiresAt: number }> = (module.get(ChatService) as any).sessions;
    sessions.get('user:1:expired')!.expiresAt = 0;
    const before = fixture.saves();
    const result = await send('Thêm vào giỏ', { sessionId: 'expired', productId: 20 }, 1);
    assert.equal(result.data.cart, undefined);
    assert.equal(fixture.saves(), before);
    const token = jwt.sign({ sub: 1, email: 'u1@example.test', role: 'USER' }, { expiresIn: -1 });
    assert.equal((await request('/chat', { message: 'Xem giỏ', sessionId: 'main' }, undefined, `Bearer ${token}`)).status, 401);
  });
});

test('confirmation requires another review if a regular cart write races with confirmation', async () => {
  const { cart, products } = cartFixture();
  await cart.add(1, 10, 1);
  await cart.add(1, 20, 1);
  const service = new ChatShoppingService({ findById: async (id: number) => products.find(p => p.id === id) } as any,
    cart, { list: async () => [] } as any);
  const state: ShoppingSession = { context: { products, hash: '' }, selectedId: 20, quantity: 2 };
  const user = { id: 1, email: 'u1@example.test', role: 'USER' as const };
  const preview = await service.handle({ message: 'Mua ngay', sessionId: 'race', action: 'buy_now' }, 'buy_now', state, user);
  assert.equal(preview!.checkout!.addresses.length, 0);
  assert.ok(preview!.checkout!.missingFields.includes('Địa chỉ và thông tin người nhận'));
  const update = cart.update.bind(cart);
  cart.update = async (userId, id, quantity) => {
    await update(userId, 10, 2);
    return update(userId, id, quantity);
  };
  const confirmation = await service.handle({ message: 'Xác nhận', sessionId: 'race', requestId: 'race-confirm',
    action: 'checkout_confirm', reviewId: preview!.checkout!.id }, 'checkout_review', state, user);
  assert.equal(confirmation!.checkoutUrl, undefined);
  assert.equal(confirmation!.checkout!.confirmed, false);
  assert.equal(confirmation!.checkout!.total, 2600000);
  assert.match(confirmation!.message, /vừa thay đổi/);
});
