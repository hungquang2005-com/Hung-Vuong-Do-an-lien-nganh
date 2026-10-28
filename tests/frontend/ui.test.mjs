import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { build } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter, Routes, Route } = require('react-router-dom');

// Compile the actual TSX with the already installed Vite compiler; only context values are fixtures.
const root = resolve(import.meta.dirname, '../../frontend');
const directory = mkdtempSync(join(root, 'node_modules', '.qa-ui-'));
after(() => rmSync(directory, { recursive: true, force: true }));
await build({ stdin: { contents: `
export { ProductPrice } from './src/components/ProductPrice';
export { ProductRating } from './src/components/ProductRating';
export { AdminGuard } from './src/components/AdminGuard';
export { LoginPage } from './src/pages/LoginPage';
export { RegisterPage } from './src/pages/RegisterPage';
export { CartPage } from './src/pages/CartPage';
export { api, formatVnd } from './src/api/client';
export { authApi, cartApi, orderApi, couponApi, productApi } from './src/api/services';
`, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', define: { 'import.meta.env': '{}' }, loader: { '.css': 'empty' },
  outfile: join(directory, 'ui.cjs'), plugins: [{ name: 'fixture-contexts', setup(builder) {
    builder.onResolve({ filter: /context\/(AuthContext|CartContext)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('AuthContext')
      ? 'export const useAuth = () => globalThis.__qaAuth;'
      : 'export const useCart = () => globalThis.__qaCart;' }));
  } }] });
const ui = createRequire(import.meta.url)(join(directory, 'ui.cjs'));
const h = React.createElement;
const render = component => renderToStaticMarkup(h(MemoryRouter, null, component));
globalThis.__qaAuth = { loading: false, user: null };
globalThis.__qaCart = { cart: null, loading: false };
after(() => { delete globalThis.__qaAuth; delete globalThis.__qaCart; });

test('QA-F01 real product price renders sale, original price, savings and ordinary zero price', () => {
  const sale = render(h(ui.ProductPrice, { product: { price: 300000, originalPrice: 500000, discountPercent: 40 } }));
  assert.ok(sale.includes(ui.formatVnd(300000))); assert.ok(sale.includes(ui.formatVnd(500000)));
  assert.ok(sale.includes(ui.formatVnd(200000))); assert.match(sale, /<del>/); assert.match(sale, /40%/);
  const regular = render(h(ui.ProductPrice, { product: { price: 0 } }));
  assert.match(regular, /0₫/); assert.doesNotMatch(regular, /<del>|Tiết kiệm/);
});

test('QA-F02 cart loading, empty checkout-disabled and populated totals render correctly', () => {
  globalThis.__qaCart = { loading: true, cart: null };
  assert.match(render(h(ui.CartPage)), /Đang tải giỏ hàng/);
  globalThis.__qaCart = { loading: false, cart: { items: [], total: 0, itemCount: 0 } };
  const empty = render(h(ui.CartPage)); assert.match(empty, /Giỏ hàng đang trống/);
  assert.match(empty, /disabled=""/);
  globalThis.__qaCart.cart = { total: 600000, itemCount: 2, items: [{ id: 1, productId: 10, quantity: 2,
    product: { id: 10, name: 'QA Kettle', price: 300000, originalPrice: 500000, discountPercent: 40 } }] };
  const full = render(h(ui.CartPage)); assert.match(full, /QA Kettle/); assert.ok(full.includes(ui.formatVnd(600000)));
  assert.doesNotMatch(full, /Giỏ hàng đang trống|disabled=""/);
});

test('QA-F03 admin guard renders loading and exposes protected outlet only to ADMIN', () => {
  const page = () => h(Routes, null, h(Route, { element: h(ui.AdminGuard) }, h(Route, { index: true, element: h('p', null, 'QA ADMIN CONTENT') })));
  globalThis.__qaAuth = { loading: true, user: null }; assert.match(render(page()), /Đang tải/);
  for (const user of [null, { role: 'USER' }]) {
    globalThis.__qaAuth = { loading: false, user }; assert.doesNotMatch(render(page()), /QA ADMIN CONTENT/);
  }
  globalThis.__qaAuth = { loading: false, user: { role: 'ADMIN' } }; assert.match(render(page()), /QA ADMIN CONTENT/);
});

test('QA-F04 login and registration render required fields, email constraint and concealed passwords', () => {
  const login = render(h(ui.LoginPage)); assert.match(login, /autoComplete="username"/);
  assert.match(login, /type="password"/); assert.match(login, /required=""/);
  const register = render(h(ui.RegisterPage)); assert.match(register, /type="email"/);
  assert.equal((register.match(/type="password"/g) ?? []).length, 2);
  assert.equal((register.match(/required=""/g) ?? []).length, 5);
});

test('QA-F05 product rating handles empty and rated states with accessible labels', () => {
  assert.match(render(h(ui.ProductRating, { product: { id: 1 } })), /Chưa có đánh giá/);
  const rated = render(h(ui.ProductRating, { product: { id: 1, averageRating: 4.3, reviewCount: 3 } }));
  assert.match(rated, /4.3 trên 5 sao, 3 đánh giá/); assert.match(rated, /\/products\/1#product-reviews/);
});

test('QA-F06 real API adapters retain payload, query filters, current JWT and propagate failures', async t => {
  let token = 'qa-synthetic-token';
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => token } });
  const adapter = ui.api.defaults.adapter;
  t.after(() => { ui.api.defaults.adapter = adapter; if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  const requests = [];
  ui.api.defaults.adapter = async config => {
    requests.push(config);
    return { data: { accepted: true }, status: 200, statusText: 'OK', config, headers: {} };
  };
  assert.deepEqual((await ui.cartApi.add(10, 2)).data, { accepted: true });
  assert.equal(requests[0].url, '/cart/add'); assert.equal(requests[0].method, 'post');
  assert.deepEqual(JSON.parse(requests[0].data), { productId: 10, quantity: 2 });
  assert.equal(requests[0].headers.Authorization, 'Bearer ' + token);
  token = null;
  await ui.productApi.list({ keyword: 'ấm', category: 'Bếp' });
  assert.deepEqual(requests[1].params, { keyword: 'ấm', category: 'Bếp' });
  assert.equal(requests[1].headers.Authorization, undefined);
  await ui.couponApi.validate('QA10', 600000, 10);
  assert.deepEqual(JSON.parse(requests[2].data), { code: 'QA10', orderAmount: 600000, productId: 10 });
  const order = { fullName: 'QA', quoteId: 'qa-checkout', quoteHash: 'qa-hash' };
  await ui.orderApi.create(order); assert.deepEqual(JSON.parse(requests[3].data), order);
  const error = new Error('simulated API failure');
  ui.api.defaults.adapter = async () => { throw error; };
  await assert.rejects(ui.authApi.login({ usernameOrEmail: 'qa', password: 'qa-only' }), failure => failure === error);
});
