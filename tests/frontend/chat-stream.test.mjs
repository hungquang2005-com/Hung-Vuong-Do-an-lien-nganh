// file này là 1 tập hợp các test case cho các chức năng về chat stream trong ứng dụng frontend.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextQueue, readChatStream } from '../../frontend/src/api/chat-stream.ts';

const encoder = new TextEncoder();
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const response = body => new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });

test('SSE displays a delta before the final result and preserves new action metadata', async () => {
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const deltas = [];
  let firstDelta;
  const first = new Promise(resolve => { firstDelta = resolve; });
  let completed = false;
  const promise = readChatStream(response(stream), text => { deltas.push(text); firstDelta(); }).then(reply => { completed = true; return reply; });
  controller.enqueue(encoder.encode(frame({ type: 'delta', text: 'Đơn hàng ' })));
  await first;
  assert.equal(completed, false);
  const reply = { message: 'Đơn hàng của bạn', source: 'shopping', intent: 'account', cached: false,
    orders: [{ id: 502, status: 'CONFIRMED', paymentStatus: 'PAID' }],
    addresses: [{ id: 101, fullName: 'Nguyễn Ánh', address: 'Hà Nội' }],
    coupons: [{ coupon: { code: 'MIN1M' }, active: true, eligible: false, reason: 'Đơn tối thiểu 1000000đ' }],
    favorites: [], actions: [{ type: 'order_detail', label: 'Chi tiết', orderId: 502 }],
    confirmation: { id: 'confirm-1', summary: 'Xóa giỏ?' },
    checkoutFlow: { stage: 'awaiting_confirmation', appliedVoucher: { code: 'K', discountAmount: 100000, finalAmount: 900000 }, quote: { id: 'durable-checkout', hash: 'abc', total: 900000, shippingFee: 0, address: { fullName: 'Nguyễn Ánh' } },
      actions: [{ type: 'checkout_place_order', label: 'Xác nhận đặt hàng', checkoutId: 'durable-checkout', quoteHash: 'abc' }] } };
  controller.enqueue(encoder.encode(frame({ type: 'delta', text: 'của bạn' }) + frame({ type: 'result', reply })));
  controller.close();
  assert.deepEqual(await promise, reply);
  assert.equal(deltas.join(''), reply.message);
});

test('arbitrary UTF-8 byte boundaries preserve Vietnamese, emoji, Markdown and SSE CRLF frames', async () => {
  const message = '**Nguyễn Ánh** 😊\n- Địa chỉ: Hà Nội\n';
  const wire = encoder.encode((frame({ type: 'delta', text: message }) + frame({ type: 'result', reply: { message } })).replace(/\n\n/g, '\r\n\r\n'));
  const stream = new ReadableStream({ start(controller) { for (const byte of wire) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const deltas = [];
  assert.equal((await readChatStream(response(stream), text => deltas.push(text))).message, message);
  assert.equal(deltas.join(''), message);
});

test('structured action validation errors and broken streams never appear as success', async () => {
  await assert.rejects(readChatStream(response(frame({ type: 'error', message: ['Thiếu họ tên', 'Thiếu địa chỉ'] })), () => {}), /Thiếu họ tên. Thiếu địa chỉ/);
  await assert.rejects(readChatStream(response(frame({ type: 'delta', text: 'Chưa xong' })), () => {}), TypeError);
  await assert.rejects(readChatStream(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }), () => {}), /Unauthorized/);
});

test('real chunk queue preserves every character while displaying small groups', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const displayed = [];
  const queue = createTextQueue(text => displayed.push(text), new AbortController().signal);
  const chunks = ['**Tiếng Việt** có dấu, ', 'không mất chữ 😊.\n', '- Bàn gỗ\n- Nồi cơm điện\n'];
  for (const chunk of chunks) queue.push(chunk);
  assert.ok(displayed.join('').length < chunks.join('').length);
  const done = queue.finish();
  for (let i = 0; i < 100; i++) t.mock.timers.tick(10000);
  await done;
  assert.equal(displayed.join(''), chunks.join(''));
  assert.ok(displayed.length > 2);
});

test('aborting a response discards its queue and cannot overwrite the next response', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const oldController = new AbortController(); const old = []; const next = [];
  const queue = createTextQueue(text => old.push(text), oldController.signal);
  queue.push('Nội dung cũ đang chờ phía sau rất dài.');
  oldController.abort(); const before = old.join('');
  const newer = createTextQueue(text => next.push(text), new AbortController().signal);
  newer.push('Phản hồi mới.'); const done = newer.finish();
  for (let i = 0; i < 30; i++) t.mock.timers.tick(10000);
  await done; await queue.finish();
  assert.equal(old.join(''), before); assert.equal(next.join(''), 'Phản hồi mới.');
});

test('cancel during unmount resolves queue completion and ignores future chunks', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  let text = ''; const queue = createTextQueue(part => { text += part; }, new AbortController().signal);
  queue.push('Một câu trả lời còn đang tiếp tục.');
  const done = queue.finish(); const before = text;
  queue.cancel(); queue.push('Không được hiển thị');
  t.mock.timers.tick(100000); await done;
  assert.equal(text, before);
});
