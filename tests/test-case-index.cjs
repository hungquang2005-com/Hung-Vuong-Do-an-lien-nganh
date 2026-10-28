const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve, join, relative } = require('node:path');
const root = resolve(__dirname, '..');
const directory = join(root, 'docs', 'test-results');
const summary = JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'));
const cases = [];
const fixtures = {
  'addresses.service.spec.ts': ['Ba địa chỉ của hai tài khoản trong bộ nhớ.', 'Đổi địa chỉ mặc định; sửa/xóa địa chỉ của chính mình hoặc tài khoản khác.'],
  'auth-schema.spec.ts': ['Schema users cũ giả lập, metadata User.', 'Chạy migration hai lần; kiểm tra ADD-only và các cột entity.'],
  'auth.service.spec.ts': ['User giả lập và mật khẩu băm bcrypt.', 'Mật khẩu đúng/sai; xác nhận khác nhau; hồ sơ hợp lệ và trường giả mạo.'],
  'auth.http.spec.ts': ['Nest HTTP loopback, JWT test, users/resetTokens trong bộ nhớ, email giả lập.', 'Đăng ký QA; đăng nhập; JWT sai/hết hạn; USER/ADMIN; OTP sai/hết hạn/đã dùng; lỗi email.'],
  'checkout.spec.ts': ['Hai tài khoản, sản phẩm 10/20/30, voucher chung/riêng/hết hạn; repository transaction giả lập.', 'Sản phẩm 500000/200000 VND; tồn kho 8/10/0; báo giá và xác nhận; thay đổi dữ liệu; retry; webhook/PIN giả lập.'],
  'chat.spec.ts': ['Nest HTTP loopback, tri thức/catalog bộ nhớ và Gemini giả lập.', 'Câu chào, câu chính sách, tìm kiếm sản phẩm, phản hồi JSON sai, lỗi 429/500/503/timeout, SSE.'],
  'shopping.spec.ts': ['Nest HTTP loopback với catalog/giỏ/địa chỉ bộ nhớ.', 'Chọn sản phẩm trong hội thoại, số lượng, thao tác giỏ và tài khoản.'],
  'user-actions.spec.ts': ['Hai tài khoản và dịch vụ nghiệp vụ với repository bộ nhớ.', 'Đơn, yêu thích, địa chỉ, voucher, xóa giỏ có xác nhận; replay; ngữ cảnh riêng; interpreter giả lập.'],
  'favorites.spec.ts': ['Hai tài khoản; sản phẩm 10 tồn tại, 999 không tồn tại.', 'Thêm lặp hai lần, liệt kê theo chủ sở hữu và xóa; thêm sản phẩm không tồn tại.'],
  'products.spec.ts': ['Metadata MySQL TypeORM chưa mở kết nối; catalog/review giả lập.', 'Keyword/category chứa SQL injection; chuỗi trắng; ID 10/999; giá ưu đãi 300000 từ 500000.'],
  'promotions.spec.ts': ['DTO, migration và transaction/khóa bộ nhớ; lịch tính tương đối theo ngày chạy.', 'ID trùng, giảm sai, quá 200 món; lịch đảo/hết hạn/thiếu múi giờ/trùng; banner sai; sản phẩm không còn.'],
  'reviews.spec.ts': ['Repository mua hàng/đánh giá và migration giả lập.', 'Sao 0/6/3.5; spoof user/order; đơn của mình đã giao + đã thanh toán; sửa hai lần; tài khoản khác.'],
  'chat-stream.test.mjs': ['Web Response/ReadableStream và đồng hồ giả của node:test.', 'UTF-8 tiếng Việt/emoji, SSE chia byte, HTTP 401, frame lỗi, abort/cancel.'],
  'ui.test.mjs': ['TSX thật biên dịch bằng esbuild; React SSR; auth/cart fixture; Axios adapter giả lập.', 'Giá sale/zero; giỏ loading/rỗng/đủ dữ liệu; USER/ADMIN; form đăng ký/đăng nhập; token/payload/lỗi API.'],
};
for (const run of summary.runs) {
  const events = readFileSync(join(directory, run.name + '.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, run.tests, 'JSON event count must match native node:test total');
  assert.equal(events.filter(e => e.status === 'PASS').length, run.pass);
  for (const [index, event] of events.entries()) {
    const file = relative(root, event.file).replaceAll('\\', '/');
    assert.ok(existsSync(join(root, file)));
    const filename = file.split('/').at(-1);
    assert.ok(fixtures[filename], 'Every suite needs documented preconditions and input');
    const [precondition, input] = fixtures[filename];
    cases.push({ id: (run.name === 'backend' ? 'BE-' : 'FE-') + String(index + 1).padStart(3, '0'),
      function: event.name, precondition, input,
      steps: `Chạy lệnh của ${run.name} trong summary.json; thực thi kịch bản này và các assertion tại ${file}.`,
      expected: event.name, actual: event.status === 'PASS' ? 'Kịch bản kết thúc không có assertion lỗi.' : event.error ?? event.status,
      status: event.status, source: file, nesting: event.nesting,
      evidence: `${run.name}.jsonl; ${run.name}.xml; ${run.name}.tap`, durationMs: event.durationMs });
  }
}
assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
writeFileSync(join(directory, 'cases.json'), JSON.stringify(cases, null, 2) + '\n');
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
writeFileSync(join(directory, 'cases.md'), '# Danh mục từng kết quả tự động\n\n'
  + `Sinh từ output thực tế của lần chạy ${summary.executedAt}. Mã BE/FE ổn định trong lần chạy này; tên QA-* là mã nghiệp vụ trong source.\n\n`
  + 'Node tính cả test cha có subtest; cột nesting trong cases.json phân biệt chúng. Thời gian chạy test giả lập không phải số liệu hiệu năng API. Đầu vào là nhóm fixture; từng giá trị và assertion cụ thể được lưu trong file source liên kết.\n\n'
  + '| Mã | Chức năng / mong đợi (tên kịch bản) | Điều kiện trước | Dữ liệu đầu vào | Bước thực hiện | Kết quả thực tế | Trạng thái | Source / bằng chứng |\n|---|---|---|---|---|---|---|---|\n'
  + cases.map(c => `| ${c.id} | ${escape(c.function)} | ${escape(c.precondition)} | ${escape(c.input)} | Chạy ${c.source}; đối chiếu assertion của kịch bản. | ${escape(c.actual)} | ${c.status} | [Source](../../${c.source}) · [JSONL](${c.evidence.split(';')[0]}) |`).join('\n') + '\n');
console.log(`Indexed ${cases.length} native test results from verified JSON events.`);
