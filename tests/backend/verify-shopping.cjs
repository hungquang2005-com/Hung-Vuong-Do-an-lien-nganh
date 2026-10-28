const backendRequire = require("node:module").createRequire(require("node:path").resolve(__dirname, "../../backend/package.json"));
const { PromotionsService } = require('../../backend/dist/promotions/promotions.service');
const { Promotion, PromotionItem } = require('../../backend/dist/database/entities/promotion.entity');
// Real MySQL repositories; connection-local temporary tables keep customer carts, products and addresses untouched.
backendRequire('reflect-metadata');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { DataSource } = backendRequire('typeorm');
const { ConfigService } = backendRequire('@nestjs/config');
const { entities } = require('../../backend/dist/database/entities');
const { Product } = require('../../backend/dist/database/entities/product.entity');
const { Cart } = require('../../backend/dist/database/entities/cart.entity');
const { CartItem } = require('../../backend/dist/database/entities/cart-item.entity');
const { UserAddress } = require('../../backend/dist/database/entities/user-address.entity');
const { ChatbotKnowledge } = require('../../backend/dist/database/entities/chatbot-knowledge.entity');
const { CartService } = require('../../backend/dist/cart/cart.service');
const { AddressesService } = require('../../backend/dist/addresses/addresses.service');
const { ChatProductsService } = require('../../backend/dist/chat/chat-products.service');
const { ChatShoppingService } = require('../../backend/dist/chat/chat-shopping.service');
const { ChatService } = require('../../backend/dist/chat/chat.service');
const { KnowledgeService } = require('../../backend/dist/chat/knowledge.service');
const { IntentService } = require('../../backend/dist/chat/intent.service');
const { SmallTalkService } = require('../../backend/dist/chat/small-talk.service');
const { GeminiService } = require('../../backend/dist/chat/gemini.service');

async function verify() {
  process.loadEnvFile(resolve(__dirname, '../../backend/.env'));
  const source = new DataSource({ type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }, connectTimeout: 10000, charset: 'utf8mb4', entities,
    supportBigNumbers: true, bigNumberStrings: false, synchronize: false, logging: false });
  await source.initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.connect();
    const productService = new ChatProductsService(runner.manager.getRepository(Product), new PromotionsService({ manager: runner.manager }));
    const catalog = await productService.context('Tất cả sản phẩm');
    assert.ok(catalog && catalog.products.length <= 5);
    console.log('Catalog PASS: bounded search on the existing product table.');
    for (const name of ['products', 'product_reviews', 'promotions', 'promotion_items', 'carts', 'cart_items', 'user_addresses']) {
      // MySQL rejects CREATE ... LIKE with identical source and destination names.
      await runner.query(`CREATE TEMPORARY TABLE shopping_verify_${name} LIKE ${name}`);
      await runner.query(`CREATE TEMPORARY TABLE ${name} LIKE shopping_verify_${name}`);
      await runner.query(`DROP TEMPORARY TABLE shopping_verify_${name}`);
      const [definition] = await runner.query(`SHOW CREATE TABLE ${name}`);
      assert.match(definition['Create Table'], /CREATE TEMPORARY TABLE/i);
    }
    await runner.startTransaction();
    const productRepo = runner.manager.getRepository(Product);
    const first = await productRepo.save(productRepo.create({ name: 'Bàn học kiểm thử gỗ', category: 'Bàn học', price: '500000', stock: 8 }));
    const second = await productRepo.save(productRepo.create({ name: 'Bàn học kiểm thử trắng', category: 'Bàn học', price: '800000', stock: 6 }));
    const cart = new CartService(runner.manager.getRepository(Cart), runner.manager.getRepository(CartItem), new PromotionsService({ manager: runner.manager }));
    const addresses = new AddressesService(runner.manager.getRepository(UserAddress));
    await runner.manager.getRepository(UserAddress).save({ userId: 1, fullName: 'Người nhận kiểm thử', phone: '0900000000', address: 'Địa chỉ kiểm thử', isDefault: true });
    const smallTalk = new SmallTalkService();
    const intents = new IntentService(smallTalk);
    const knowledge = new KnowledgeService(runner.manager.getRepository(ChatbotKnowledge), productService, intents);
    const chat = new ChatService(knowledge, productService, intents, smallTalk, new GeminiService(new ConfigService({})), new ChatShoppingService(productService, cart, addresses), { handle: async () => null }, { handle: async () => null });
    const user = { id: 1, email: 'shopping-test@example.test', role: 'USER' };
    let sequence = 0;
    const send = (message, extra = {}) => chat.send(message, 'mysql-shopping-test', user, { requestId: `mysql-${++sequence}`, ...extra });
    const found = await send('Tìm bàn học dưới 1 triệu');
    assert.deepEqual(found.products.map(product => product.id), [first.id, second.id]);
    const chosen = await send('Tôi lấy cái thứ hai');
    assert.equal(chosen.products[0].id, second.id);
    const added = await send('Thêm cho tôi hai cái');
    assert.equal(added.cart.total, 1600000);
    assert.deepEqual((await send('Xem giỏ hàng')).cart, await cart.get(user.id));
    await send('Đổi số lượng thành 3');
    await Promise.all([send('Thêm 1 cái', { requestId: 'mysql-duplicate' }), send('Thêm 1 cái', { requestId: 'mysql-duplicate' })]);
    assert.equal((await cart.get(user.id)).itemCount, 4);
    assert.equal((await cart.get(2)).itemCount, 0);
    await assert.rejects(() => send('Thêm 9 cái'), error => error.getStatus() === 400);
    const review = await send('Mua ngay 2 cái');
    assert.equal(review.checkout.total, 1600000);
    assert.equal((await cart.get(user.id)).itemCount, 4);
    const confirmed = await send('Xác nhận', { action: 'checkout_confirm', reviewId: review.checkout.id });
    assert.equal(confirmed.checkout.confirmed, true);
    assert.equal(confirmed.cart.itemCount, 2);
    assert.equal(confirmed.cart.total, confirmed.checkout.total);
    const removed = await send('Bỏ sản phẩm vừa chọn đi');
    assert.equal(removed.cart.total, 0);
    console.log('Shopping PASS: selection, real cart writes/locks, quantity, totals, ownership, replay, stock and buy-now review/confirmation.');
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    for (const name of ['cart_items', 'carts', 'products', 'user_addresses']) {
      await runner.query(`DROP TEMPORARY TABLE IF EXISTS ${name}`).catch(() => {});
    }
    await runner.release();
    await source.destroy();
    console.log('Temporary shopping fixtures rolled back and removed; no order/payment calls.');
  }
}
verify().catch(error => {
  console.error('Shopping integration check failed: ' + (error.getStatus?.() || error.code || error.name || 'UNKNOWN'));
  process.exitCode = 1;
});
