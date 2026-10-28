# Kiểm thử Gia dụng Việt

Toàn bộ mã kiểm thử và công cụ hỗ trợ nằm tại đây:

- `backend/`: các file `*.spec.ts` và script `verify-*.cjs`.
- `frontend/`: kiểm thử giao diện/API và chat stream.
- `run-tests.cjs`: chạy các test cô lập, xuất kết quả và build.
- `test-json-reporter.cjs`, `test-case-index.cjs`: xuất bằng chứng và danh mục từng ca.
- `tsconfig.backend.json`: dùng cấu hình TypeScript và dependency của backend cho test nằm ngoài source.

Chạy từ thư mục gốc sau khi backend/frontend đã cài dependency:

```powershell
node tests/run-tests.cjs
node tests/test-case-index.cjs
```

Chạy riêng:

```powershell
node tests/run-tests.cjs backend
node tests/run-tests.cjs backend auth
node tests/run-tests.cjs backend chat
node tests/run-tests.cjs frontend
node tests/run-tests.cjs frontend ui
```

Các lệnh `npm test` và `npm run test:*` hiện có trong backend/frontend trỏ tới thư mục này. Runner thông thường chỉ chạy `*.spec.ts`/`*.test.mjs`; `verify-*.cjs` là kiểm thử tích hợp opt-in có thể nạp `.env` và kết nối dịch vụ thật, không được chạy tự động.

Kết quả vẫn lưu ở `docs/test-results/`, báo cáo ở `docs/TESTING_REPORT.md` và `docs/TEST_CASES_FOR_REPORT.md`.
