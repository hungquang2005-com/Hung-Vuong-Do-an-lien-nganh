const backendRequire = require("node:module").createRequire(require("node:path").resolve(__dirname, "../../backend/package.json"));
// Real MySQL + real controllers/services. Connection-local temporary tables isolate all test writes.
backendRequire('reflect-metadata');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { DataSource } = backendRequire('typeorm');
const { Test } = backendRequire('@nestjs/testing');
const { ValidationPipe } = backendRequire('@nestjs/common');
const { ConfigService } = backendRequire('@nestjs/config');
const { JwtService } = backendRequire('@nestjs/jwt');
const { entities } = require('../../backend/dist/database/entities');
const { Product, ProductReview, Promotion, PromotionItem, User, Cart, CartItem, Order, OrderItem, Payment, Coupon, CheckoutRecord } = require('../../backend/dist/database/entities/index');
const { ReviewsService } = require('../../backend/dist/reviews/reviews.service');
const { ReviewsController } = require('../../backend/dist/reviews/reviews.controller');
const { PromotionsService } = require('../../backend/dist/promotions/promotions.service');
const { PromotionsController } = require('../../backend/dist/promotions/promotions.controller');
const { ProductsService } = require('../../backend/dist/products/products.service');
const { ProductsController } = require('../../backend/dist/products/products.controller');
const { CartService } = require('../../backend/dist/cart/cart.service');
const { CartController } = require('../../backend/dist/cart/cart.controller');
const { OrdersService } = require('../../backend/dist/orders/orders.service');
const { OrdersController } = require('../../backend/dist/orders/orders.controller');
const { CouponsService } = require('../../backend/dist/coupon/coupons.service');
const { CouponsController } = require('../../backend/dist/coupon/coupons.controller');
const { ChatProductsService } = require('../../backend/dist/chat/chat-products.service');
const { JwtStrategy } = require('../../backend/dist/auth/jwt.strategy');

async function verify() {
  process.loadEnvFile(resolve(__dirname, '../../backend/.env'));
  const source = new DataSource({ type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }, connectTimeout: 10000, charset: 'utf8mb4', entities,
    supportBigNumbers: true, bigNumberStrings: false, synchronize: false, logging: false });
  await source.initialize();
  const runner = source.createQueryRunner(); let app;
  try {
    await runner.connect();
    const realCatalog = await runner.manager.getRepository(Product).find({ order: { id: 'ASC' }, take: 8 });
    for (const name of ['products', 'product_reviews', 'promotions', 'promotion_items', 'promotion_lock', 'users', 'carts', 'cart_items', 'orders', 'order_items', 'payments', 'coupons', 'checkout_records']) {
      await runner.query(`CREATE TEMPORARY TABLE promotion_verify_${name} LIKE ${name}`);
      await runner.query(`CREATE TEMPORARY TABLE ${name} LIKE promotion_verify_${name}`);
      await runner.query(`DROP TEMPORARY TABLE promotion_verify_${name}`);
      const [definition] = await runner.query(`SHOW CREATE TABLE ${name}`);
      assert.match(definition['Create Table'], /CREATE TEMPORARY TABLE/i, `Refusing writes: ${name} is not a temporary table`);
    }
    await runner.startTransaction();
    await runner.query('INSERT INTO promotion_lock (id) VALUES (1)');
    const db = { manager: runner.manager, getRepository: entity => runner.manager.getRepository(entity), transaction: work => runner.manager.transaction(work) };
    const repo = entity => runner.manager.getRepository(entity);
    const promotions = new PromotionsService(db), products = new ProductsService(repo(Product), promotions);
    const reviews = new ReviewsService(db);
    await repo(User).save([1, 2].map(id => ({ id, fullName: `Khách kiểm thử ${id}`, email: `promotion-test-${id}@example.test`, password: 'not-a-real-login' })));
    const cart = new CartService(repo(Cart), repo(CartItem), promotions);
    const orders = new OrdersService(db, repo(Order), repo(Product), repo(Cart), repo(CartItem), repo(OrderItem), repo(Payment), repo(User), promotions);
    const coupons = new CouponsService(repo(Coupon), cart), chatbot = new ChatProductsService(repo(Product), promotions);
    if (process.argv.includes('--serve')) await repo(Product).save(realCatalog);
    else await repo(Product).save([
      { id: 1, name: 'Nồi cơm điện kiểm thử', price: '500000', stock: 5, category: 'Nồi cơm điện' },
      { id: 2, name: 'Máy xay kiểm thử', price: '200000', stock: 5 },
      { id: 3, name: 'Nồi cơm điện hết hàng', price: '1000000', stock: 0 },
    ]);
    const config = new ConfigService({ JWT_SECRET: 'promotion-integration-only' });
    const moduleRef = await Test.createTestingModule({
      controllers: [PromotionsController, ProductsController, CartController, OrdersController, CouponsController, ReviewsController],
      providers: [JwtStrategy, { provide: ConfigService, useValue: config }, { provide: PromotionsService, useValue: promotions },
        { provide: ProductsService, useValue: products }, { provide: CartService, useValue: cart },
        { provide: OrdersService, useValue: orders }, { provide: CouponsService, useValue: coupons }, { provide: ReviewsService, useValue: reviews }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: ['error'] });
    // Temporary tables share one connection; serialize HTTP requests to avoid overlapping savepoints in UI StrictMode.
    let requestTail = Promise.resolve();
    app.use((_request, response, next) => {
      const previous = requestTail;
      requestTail = new Promise(resolve => { response.once('finish', resolve); response.once('close', resolve); });
      previous.then(() => next());
    });
    app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.enableCors({ origin: ['http://localhost:5174', 'http://127.0.0.1:5174'] });
    const jwt = new JwtService({ secret: config.get('JWT_SECRET') });
    const token = (role, sub = 1) => jwt.sign({ sub, role, email: 'promotion-test@example.test' }, { expiresIn: '1h' });
    if (process.argv.includes('--serve')) {
      app.getHttpAdapter().get('/api/auth/me', (request, response) => {
        try { const claims = jwt.verify((request.headers.authorization || '').replace('Bearer ', '')); response.json({ id: claims.sub, role: claims.role, fullName: 'Quản trị kiểm thử', username: 'promotion-qa', email: claims.email }); }
        catch { response.status(401).json({ message: 'Unauthorized' }); }
      });
      app.getHttpAdapter().get('/api/favorites', (_request, response) => response.json([]));
    }
    await app.listen(process.argv.includes('--serve') ? 3101 : 0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
    const request = (path, method = 'GET', body, role = 'ADMIN', userId = 1) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${token(role, userId)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const future = delta => new Date(Date.now() + delta).toISOString();
    if (process.argv.includes('--serve')) {
      const available = realCatalog.filter(product => product.stock > 0 && Number(product.price) > 100);
      await promotions.save({ title: 'Đại tiệc gia dụng cuối tuần', description: 'Chọn món đồ yêu thích, sắm tiện nghi cho cả nhà.', status: 'published', startsAt: future(-60000), endsAt: future(86400000), items: available.map((product, i) => ({ productId: Number(product.id), discountPercent: [40, 35, 30, 25][i % 4] })) });
      const purchase = await repo(Order).save({ userId: 1, fullName: 'Khách kiểm thử', email: 'promotion-test@example.test', phone: '0900000000', address: 'Địa chỉ QA', totalAmount: '1', subtotalAmount: '1', discountAmount: '0', status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'CASH' });
      await repo(OrderItem).save(available.map(product => ({ orderId: purchase.id, productId: product.id, productName: product.name, price: product.price, quantity: 1, subtotal: product.price })));
      console.log('Isolated UI QA API ready at http://127.0.0.1:3101/api. Every writable table is verified TEMPORARY; catalog copied read-only.');
      await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
      return;
    }
    const input = { title: 'Ưu đãi kiểm thử', description: 'Chỉ nằm trong bảng tạm', status: 'draft', startsAt: future(-60000), endsAt: future(3600000), items: [{ productId: 1, discountPercent: 40 }, { productId: 3, discountPercent: 70 }] };
    assert.equal((await request('/promotions/admin', 'GET', undefined, '')).status, 401);
    assert.equal((await request('/promotions', 'POST', input, 'USER')).status, 403);
    assert.equal((await request('/promotions/0', 'PATCH', input)).status, 404);
    assert.equal((await request('/promotions', 'POST', { ...input, items: [{ productId: 1, discountPercent: 100 }] })).status, 400);
    assert.equal((await request('/promotions', 'POST', { ...input, items: [...input.items, input.items[0]] })).status, 400);
    const created = await request('/promotions', 'POST', input); assert.equal(created.status, 201);
    const event = await created.json(); assert.equal(event.phase, 'draft');
    assert.equal((await promotions.current()).event, null);
    const saved = await promotions.save({ ...input, status: 'published' }, event.id);
    const current = await promotions.current(); assert.equal(current.event.products.length, 1); assert.equal(current.event.maxDiscountPercent, 40);
    assert.equal((await products.findOne(1)).price, 300000); assert.equal((await repo(Product).findOneBy({ id: 1 })).price, '500000');
    const hits = await chatbot.context('Nồi cơm điện dưới 350 nghìn');
    assert.equal(Number(hits.products[0].price), 300000); const hash = hits.hash;
    assert.equal((await request('/promotions', 'POST', { ...input, status: 'published' })).status, 409);
    await promotions.save({ ...input, startsAt: input.endsAt, endsAt: future(7200000), status: 'published' });
    await promotions.save({ ...input, status: 'paused' }, event.id);
    assert.equal((await products.findOne(1)).price, 500000);
    assert.notEqual((await chatbot.context('Nồi cơm điện dưới 350 nghìn')).hash, hash);
    await promotions.save({ ...input, status: 'published' }, event.id);
    await cart.add(1, 1, 1); await cart.add(1, 2, 2);
    await repo(Coupon).save({ code: 'TEST10', discountType: 'percentage', discountValue: 10, minOrderAmount: 0, startDate: new Date(Date.now() - 60000), endDate: new Date(Date.now() + 3600000), isActive: true, userId: null, maxDiscountAmount: null, usageLimit: 2, usedCount: 0, freeShipping: false });
    const voucher = await coupons.validateCoupon('TEST10', 999999999, 1); assert.equal(voucher.discountAmount, 40000); assert.equal(voucher.finalAmount, 660000);
    const orderInput = { fullName: 'Người nhận kiểm thử', email: 'promotion-test@example.test', phone: '0900000000', address: 'Địa chỉ kiểm thử', paymentMethod: 'CASH', couponCode: 'TEST10', note: 'Giữ nguyên ghi chú' };
    const previewResponse = await request('/orders/preview', 'POST', orderInput, 'USER'); assert.equal(previewResponse.status, 201);
    const quote = await previewResponse.json(); assert.equal(quote.total, 660000);
    await promotions.save({ ...input, status: 'paused' }, event.id);
    const changed = await request('/orders', 'POST', { ...orderInput, quoteId: quote.id, quoteHash: quote.hash }, 'USER'); assert.equal(changed.status, 409);
    assert.equal(await repo(Order).count(), 0); const replacement = (await changed.json()).quote; assert.equal(replacement.total, 810000);
    await repo(Product).update(1, { stock: 0 });
    assert.equal((await request('/orders', 'POST', { ...orderInput, quoteId: replacement.id, quoteHash: replacement.hash }, 'USER')).status, 400);
    assert.equal(await repo(Order).count(), 0); await repo(Product).update(1, { stock: 5 });
    const confirmed = await request('/orders', 'POST', { ...orderInput, quoteId: replacement.id, quoteHash: replacement.hash }, 'USER'); assert.equal(confirmed.status, 201);
    const order = await confirmed.json(); assert.equal(order.totalAmount, 810000); assert.equal(order.note, orderInput.note);
    const replay = await request('/orders', 'POST', { ...orderInput, quoteId: replacement.id, quoteHash: replacement.hash }, 'USER'); assert.equal((await replay.json()).id, order.id);
    await promotions.save({ ...input, status: 'published' }, event.id);
    assert.equal((await orders.getOneForUser(1, order.id)).totalAmount, 810000); assert.equal((await repo(Payment).findOneBy({ orderId: order.id })).amount, '810000');
    assert.equal((await request('/promotions/' + event.id, 'PATCH', { ...input, status: 'published', bannerDiscountPercent: 80 })).status, 400);
    await promotions.save({ ...input, status: 'published', bannerDiscountPercent: 60 }, event.id);
    assert.equal((await promotions.current()).event.displayDiscountPercent, 40, 'Banner cannot overstate the available discount');
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5 }, '')).status, 401);
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5 }, 'USER')).status, 403, 'Pending purchase is not eligible');
    await repo(Order).update(order.id, { status: 'DELIVERED', paymentStatus: 'UNPAID' });
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5 }, 'USER')).status, 403, 'Unpaid purchase is not eligible');
    await repo(Order).update(order.id, { status: 'CANCELLED', paymentStatus: 'PAID' });
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5 }, 'USER')).status, 403, 'Cancelled purchase is not eligible');
    await repo(Order).update(order.id, { status: 'DELIVERED', paymentStatus: 'PAID' });
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5 }, 'USER', 2)).status, 403, 'Cannot reuse someone else\'s purchase');
    assert.equal((await request('/products/3/reviews', 'PUT', { rating: 5 }, 'USER')).status, 403, 'Cannot review a product absent from the purchase');
    for (const body of [{ rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: 5, userId: 2 }, { rating: 5, orderId: order.id }, { rating: 5, comment: 'a'.repeat(2001) }]) assert.equal((await request('/products/1/reviews', 'PUT', body, 'USER')).status, 400);
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 5, comment: 'Sản phẩm tốt' }, 'USER')).status, 200);
    assert.equal((await request('/products/1/reviews', 'PUT', { rating: 4, comment: 'Cập nhật cảm nhận' }, 'USER')).status, 200);
    assert.equal(await repo(ProductReview).count(), 1, 'Editing replaces the rating instead of incrementing the count');
    await assert.rejects(repo(ProductReview).insert({ userId: 1, productId: 1, orderId: order.id, rating: 5, comment: 'duplicate' }), error => error.code === 'ER_DUP_ENTRY');
    const secondPurchase = await repo(Order).save({ ...(await repo(Order).findOneBy({ id: order.id })), id: undefined, userId: 2 });
    await repo(OrderItem).save({ orderId: secondPurchase.id, productId: 1, productName: 'Nồi cơm điện kiểm thử', price: '500000', subtotal: '500000', quantity: 1 });
    await reviews.save(2, 1, { rating: 3, comment: 'Nhận xét khác' });
    const page = await (await request('/products/1/reviews?rating=4')).json();
    assert.equal(page.total, 1); assert.equal(page.summary.reviewCount, 2); assert.equal(page.summary.averageRating, 3.5);
    assert.deepEqual(page.summary.ratingCounts, { 1: 0, 2: 0, 3: 1, 4: 1, 5: 0 });
    assert.equal(page.reviews[0].userId, undefined); assert.equal(page.reviews[0].orderId, undefined); assert.equal(page.reviews[0].email, undefined);
    assert.equal((await products.findOne(1)).reviewCount, 2); assert.equal((await promotions.current()).event.products[0].averageRating, 3.5);
    assert.equal((await reviews.mine(1, 1)).review.rating, 4); assert.equal((await reviews.mine(2, 1)).review.rating, 3);
    assert.equal((await request('/products/1/reviews?rating=6')).status, 400);
    assert.equal((await request('/products/9999999/reviews')).status, 404);
    console.log('PASS: verified-purchase reviews, ownership, rating validation, one review per buyer/product, edit counts, aggregate stars, filtering, public privacy and editable banner cap.');
    console.log('PASS: MySQL + HTTP authorization/validation, draft/publish/pause/schedule, overlap, catalog/chat budget, original price, coupon exclusions, stock, re-confirmation, idempotency, frozen orders/payments.');

  } finally {
    if (app) await app.close();
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release(); await source.destroy();
  }
}
verify().catch(error => { console.error('Promotion verification failed:', error.code === 'ERR_ASSERTION' ? error.stack : error.code || error.message); process.exitCode = 1; });
