const backendRequire = require("node:module").createRequire(require("node:path").resolve(__dirname, "../../backend/package.json"));
const { PromotionsService } = require('../../backend/dist/promotions/promotions.service');
const { Promotion, PromotionItem } = require('../../backend/dist/database/entities/promotion.entity');
// Opt-in integration check: real MySQL, all test knowledge rolled back; --gemini makes one live AI call.
backendRequire('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { resolve } = require('node:path');
const { DataSource } = backendRequire('typeorm');
const { ConfigService } = backendRequire('@nestjs/config');
const { Product } = require('../../backend/dist/database/entities/product.entity');
const { ChatbotKnowledge, KnowledgeStatus } = require('../../backend/dist/database/entities/chatbot-knowledge.entity');
const { KnowledgeService } = require('../../backend/dist/chat/knowledge.service');
const { ChatProductsService } = require('../../backend/dist/chat/chat-products.service');
const { ChatService } = require('../../backend/dist/chat/chat.service');
const { ChatShoppingService } = require('../../backend/dist/chat/chat-shopping.service');
const { IntentService } = require('../../backend/dist/chat/intent.service');
const { SmallTalkService } = require('../../backend/dist/chat/small-talk.service');
const { GeminiService } = require('../../backend/dist/chat/gemini.service');
const { normalizeQuestion } = require('../../backend/dist/chat/chat-matching');
const { upgradeKnowledge } = require('../../backend/scripts/setup-chatbot.cjs');

async function verifyMigration(options) {
  const connection = await backendRequire('mysql2/promise').createConnection({
    host: options.host, port: options.port, user: options.username, password: options.password,
    database: options.database, ssl: options.ssl, charset: 'utf8mb4', connectTimeout: 10000,
  });
  try {
    // A session-local temporary table shadows the real table only on this connection; nothing persistent is created or dropped.
    await connection.query(`CREATE TEMPORARY TABLE chatbot_knowledge (
      id INT PRIMARY KEY, question VARCHAR(1000), answer TEXT,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);
    await connection.execute('INSERT INTO chatbot_knowledge (id, question, answer, status) VALUES (1, ?, ?, ?), (2, ?, ?, ?), (3, ?, ?, ?)',
      ['haha', 'Legacy small talk', 'pending', 'Shop có giao hàng không?', 'Legacy approved answer', 'approved', 'Chính sách hoàn tiền?', 'Legacy rejected answer', 'rejected']);
    const [before] = await connection.query('SELECT id, question, answer, updated_at FROM chatbot_knowledge ORDER BY id');
    const result = await upgradeKnowledge(connection, new IntentService(new SmallTalkService()), normalizeQuestion);
    assert.deepEqual(result, { backfilled: 3, hidden: 1 });
    const [after] = await connection.query('SELECT id, question, answer, updated_at FROM chatbot_knowledge ORDER BY id');
    assert.deepEqual(after, before);
    const [rows] = await connection.query('SELECT status, should_store FROM chatbot_knowledge ORDER BY id');
    assert.deepEqual(rows.map(row => row.status), ['pending_review', 'approved', 'rejected']);
    assert.deepEqual(rows.map(row => row.should_store), [0, 1, 1]);
    assert.deepEqual(await upgradeKnowledge(connection, new IntentService(new SmallTalkService()), normalizeQuestion), { backfilled: 0, hidden: 0 });
    console.log('Migration PASS: legacy statuses/content preserved, small talk hidden, second run unchanged (temporary table only).');
  } finally { await connection.end(); }
}

async function verify() {
  process.loadEnvFile(resolve(__dirname, '../../backend/.env'));
  const source = new DataSource({
    type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }, connectTimeout: 10000, charset: 'utf8mb4',
    entities: [Product, ChatbotKnowledge, Promotion, PromotionItem], synchronize: false, logging: false,
  });
  if (process.argv.includes('--migration')) await verifyMigration(source.options);
  await source.initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.startTransaction();
    const repo = runner.manager.getRepository(ChatbotKnowledge);
    const products = new ChatProductsService(runner.manager.getRepository(Product), new PromotionsService({ manager: runner.manager }));
    const smallTalk = new SmallTalkService();
    const intents = new IntentService(smallTalk);
    const knowledge = new KnowledgeService(repo, products, intents);
    const fixture = await knowledge.create({ question: `Shop có giao hàng không? Kiểm thử ${randomUUID()}`, answer: 'Câu trả lời chính sách dùng riêng trong kiểm thử.' });
    assert.equal(fixture.status, 'pending_review');
    assert.equal((await knowledge.candidates(fixture.question)).length, 0);
    await knowledge.moderate(fixture.id, KnowledgeStatus.APPROVED, 1);
    const hit = (await knowledge.candidates(fixture.question))[0];
    assert.equal(hit.id, fixture.id);
    assert.equal(await knowledge.use(hit), true);
    assert.equal((await knowledge.detail(hit.id)).usageCount, 1);
    const chairs = await products.context('Có ghế dưới 2 triệu không?');
    assert.ok(chairs);
    assert.ok(chairs.products.every(product => Number(product.price) <= 2000000 && product.stock > 0));
    assert.ok(chairs.products.length <= 5);
    console.log('MySQL PASS: pending/approve/match/usage_count, bounded price/stock query.');

    if (process.argv.includes('--gemini')) {
      const chat = new ChatService(knowledge, products, intents, smallTalk, new GeminiService(new ConfigService(process.env)), new ChatShoppingService(products, {}, {}), { handle: async () => null }, { handle: async () => null });
      assert.equal((await chat.send('Xin chào')).source, 'small_talk');
      assert.equal((await chat.stats()).geminiCalls, 0);
      const question = `Shop có giao hàng không? Kiểm thử ${randomUUID()}`;
      const first = await chat.send(question);
      assert.equal(first.source, 'system');
      assert.ok(first.message.length > 0);
      const pending = await repo.findOneByOrFail({ question });
      assert.equal(pending.status, 'pending_review');
      assert.equal(pending.riskLevel, 'HIGH');
      assert.equal(pending.source, 'gemini');
      assert.ok(!first.message.includes(pending.answer));
      assert.equal((await chat.send(question)).source, 'system');
      await knowledge.moderate(pending.id, KnowledgeStatus.APPROVED, 1);
      const second = await chat.send(question);
      assert.equal(second.source, 'knowledge');
      assert.equal((await chat.stats()).geminiCalls, 1);
      console.log('Gemini PASS: structured JSON -> HIGH/pending_review (draft-only) -> approved -> knowledge; one call including repeat and greeting.');
    }
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
    console.log('Integration test knowledge rolled back.');
  }
}

verify().catch(error => {
  console.error('Chatbot integration check failed: ' + (error.getStatus?.() || error.code || error.name || 'UNKNOWN'));
  process.exitCode = 1;
});
