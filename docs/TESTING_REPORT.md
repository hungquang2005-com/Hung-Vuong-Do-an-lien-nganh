# Báo cáo kiểm thử Gia dụng Việt

Ngày thực hiện: 27/10/2026, múi giờ Asia/Bangkok (UTC+7). Mốc UTC do công cụ ghi sau khi gom test vào `tests/`: `2026-10-26T21:00:56.509Z`. Đây là kết quả kiểm thử tự động trên mã nguồn trong workspace, bao gồm các thay đổi cục bộ chưa commit; không phải biên bản nghiệm thu production.

## A. Môi trường và cách chạy lại

| Thành phần | Phiên bản thực tế / cấu hình |
|---|---|
| Hệ điều hành | Windows, PowerShell |
| Node.js / npm | v22.8.0 / 10.8.2 |
| Framework test | `node:test`, `node:assert/strict`; không cài dependency mới |
| Backend | NestJS / @nestjs/testing 11.2.5; TypeORM 0.3.31; ts-node 10.9.2; TypeScript 5.9.3; mysql2 3.24.4 |
| Frontend | React / React DOM 19.3.0; Vite 6.4.3; esbuild 0.25.12; TypeScript 5.9.3 |
| HTTP tích hợp | Nest testing module + ValidationPipe và JWT strategy/guards thật; lắng nghe `127.0.0.1` trên cổng ngẫu nhiên; request bằng fetch |
| Dữ liệu | Fixture bộ nhớ được tạo riêng cho từng test/suite; không nạp `.env`, không import AppModule/DatabaseModule |
| Database test thật | Chưa cấu hình. Probe TCP `127.0.0.1:3306` trả `ECONNREFUSED`; không chạy SQL trên database phát triển/production |
| Provider | Email giả lập; SDK PayOS giữ logic chữ ký nhưng mock các phương thức mạng; Gemini mock response/error/stream |
| Frontend UI | React server rendering của TSX thật; fixture thay các giá trị context. Axios adapter giả lập; không trình duyệt/DOM |

Từ thư mục gốc:

```powershell
node tests/run-tests.cjs
node tests/test-case-index.cjs
```

Lệnh đầu tự tìm tất cả `tests/backend/*.spec.ts` và `tests/frontend/*.test.mjs`, chạy tuần tự từng file, xuất TAP/JUnit/JSONL, rồi chạy `npm run build` tại backend và frontend. Lệnh thứ hai đối chiếu số event JSON với tổng của Node, kiểm tra đường dẫn source và tạo danh mục từng ca. Cả hai đã thực thi thành công. Kết quả đầy đủ: [summary.json](test-results/summary.json).

Chạy từng phần:

```powershell
node tests/run-tests.cjs backend
node tests/run-tests.cjs frontend

# Hoặc chạy trong thư mục tương ứng:
# backend:
npm.cmd test
npm.cmd run test:auth
npm.cmd run test:addresses
npm.cmd run test:checkout
npm.cmd run test:chat
npm.cmd run test:promotions
npm.cmd run test:reviews
# frontend:
npm.cmd test
npm.cmd run test:chat
npm.cmd run test:ui
```

Các lệnh npm theo nhóm ở trên là cách chạy lại tương đương; lần chạy toàn bộ dùng Node CLI chính xác được ghi trong `summary.json`. PowerShell chặn `npm.ps1` ở môi trường này, nên khi gọi trực tiếp dùng `npm.cmd`. Không thay đổi execution policy.

Các lệnh kiểm tra có thực thi thêm: `node --version`, `npm.cmd --version`, chạy riêng `auth.http.spec.ts`, nhóm `QA-HTTP` trong `checkout.spec.ts`, `products.spec.ts`, `reviews.spec.ts`, `favorites.spec.ts`, `promotions.spec.ts`, `ui.test.mjs`; `git diff --check` và `node --check` cho runner/reporter/index/UI test. Các lần chạy trước sửa được giữ riêng; không cộng dồn vào tổng cuối.

## B. Khảo sát, khoảng trống và ưu tiên

Nguồn đã đối chiếu gồm package.json, entrypoint và cấu hình database, controller/service/DTO/guard/entity liên quan auth, products, cart, orders, coupon, reviews, favorites, promotions và chat; phía frontend gồm API client/services, AuthContext/CartContext, LoginPage/RegisterPage/CartPage, AdminGuard, giá và đánh giá sản phẩm.

| Ưu tiên | Khoảng trống ban đầu | Công việc đã thực hiện |
|---|---|---|
| P0 | Auth chỉ có đổi mật khẩu/hồ sơ và migration; thiếu đăng ký, đăng nhập và vòng đời OTP | Thêm HTTP test đăng ký/đăng nhập, JWT, role, OTP, lỗi email; sửa validation đăng ký |
| P0 | Nhiều kiểm tra quyền qua chatbot; thiếu API giỏ/đơn thông thường | Tái sử dụng fixture transaction hiện có; thêm HTTP cart/order/coupon, ownership, giá giả mạo, retry, trạng thái COD |
| P0 | Validation API voucher dùng type TypeScript không có metadata DTO | Test tái hiện HTTP 500; thêm DTO runtime; xác minh HTTP 400 |
| P1 | Reviews tập trung DTO, summary, migration | Thêm điều kiện mua hàng, quyền sở hữu và upsert khi sửa |
| P1 | Favorites chủ yếu được gọi qua chatbot | Thêm service test riêng về thêm lặp, cách ly tài khoản và sản phẩm không tồn tại |
| P1 | Products chưa có suite riêng | Kiểm tra SQL parameter binding qua TypeORM thật, xử lý ID thiếu và serialize giá/stock/review |
| P1 | Promotions có DTO và migration nhưng thiếu biên service | Thêm lỗi ngày/múi giờ/banner, trùng lịch và sản phẩm không tồn tại trước khi ghi |
| P1 | Frontend chỉ có 6 test stream | Thêm 6 test render/API, giữ bộ test stream sẵn có |
| P2 | Chưa có đầu ra tổng hợp, catalog từng ca và lệnh toàn bộ | Thêm runner, native JSON reporter, index; hai báo cáo phục vụ đồ án |
| Còn lại | Database thật, browser E2E, provider sandbox, tải/hiệu năng | Ghi BLOCKED/NOT RUN ở mục E; không gán PASS |

Các chức năng tài khoản/OTP, địa chỉ, mua hàng/báo giá, coupon, khuyến mãi, yêu thích, đánh giá, admin và chatbot đều có mã nguồn. Thanh toán thẻ là mô phỏng. PayOS/Gemini/Resend cần cấu hình ngoài. Không coi phí giao hàng thực, quản lý bảo hành/đổi trả hay tích hợp hãng vận chuyển là chức năng đã được kiểm thử chỉ vì giao diện có lời giới thiệu.

## C. Danh sách test case và bằng chứng

Danh mục đầy đủ của **118 kết quả Node** có đủ mã, chức năng, điều kiện trước, đầu vào, bước chạy, mong đợi, thực tế, trạng thái và source/bằng chứng tại [cases.md](test-results/cases.md); dữ liệu tương ứng tại [cases.json](test-results/cases.json). Giá trị chi tiết từng payload và assertion nằm trong source được liên kết; tên kịch bản là tiêu chí mong đợi, không được dùng để suy ra kiểm thử thủ công đã chạy.

| Nhóm mới | Điều kiện trước / đầu vào | Bước chính | Kết quả mong đợi | Kết quả thực tế |
|---|---|---|---|---|
| QA-A01 | Kho users rỗng; email sai, mật khẩu ngắn, tên rỗng/trắng/quá dài, spoof role | POST /auth/register | 400; không lưu user | PASS; tất cả payload bị từ chối; kho users rỗng |
| QA-A02 | Dữ liệu QA hợp lệ và bản sao trùng email/username | Đăng ký rồi gửi lại | 201, role USER, password băm; trùng 409 | PASS; bcrypt so khớp; response không chứa password |
| QA-A03 | User QA đã tồn tại | Login bằng username/email, mật khẩu đúng/sai, tên không tồn tại | 201 hoặc 401 đúng trường hợp | PASS; mã HTTP đúng |
| QA-A04 | JWT giả lập hợp lệ, hỏng, hết hạn, sai chữ ký hoặc thiếu | GET /auth/me | Token sai/thiếu 401; token đúng chỉ trả hồ sơ của mình | PASS; không trả hash PIN |
| QA-A05 | Anonymous, USER và ADMIN; dashboard/revenue/users | GET ba API quản trị | Lần lượt 401/403/200 | PASS; 9 yêu cầu có mã đúng; dữ liệu dashboard là stub |
| QA-A06 | Email QA; bộ gửi email giả lập | Yêu cầu OTP hai lần | Chỉ lưu hash, hiệu lực 5 phút; vô hiệu OTP cũ | PASS; một token chưa dùng |
| QA-A07 | OTP sai định dạng/sai giá trị/hết hạn/chưa xác minh | Verify/reset | 400; password không đổi | PASS |
| QA-A08 | OTP hợp lệ | Verify; reset; dùng lại; đăng nhập cũ/mới | Reset một lần; dùng lại 400; mật khẩu cũ 401, mới 201 | PASS; đây là replay tuần tự |
| QA-A09 | Provider email giả lập ném lỗi | Forgot-password | Không để token pending; không lộ OTP | PASS; 500 và số token không tăng |
| QA-B01 | Giỏ/đơn bộ nhớ; anonymous, USER, ADMIN | GET API cart/orders/admin orders | 401/403/200 theo quyền | PASS |
| QA-B02 | Tồn kho 8/0; quantity 0/-1/1.5/99, ID thiếu, spoof userId | POST /cart/add | 400/404; giỏ không đổi | PASS |
| QA-B03 | Hai tài khoản cùng sản phẩm 10 | Thêm, sửa số lượng, xóa ở tài khoản thứ hai | Không tác động giỏ tài khoản khác | PASS; giỏ thứ nhất còn 3 món, giỏ thứ hai rỗng |
| QA-B04 | Metadata TypeORM; keyword/category chứa `' OR 1=1 --` | ProductsService.list; xem SQL và parameters | Payload nằm trong parameter; không nối vào SQL | PASS; chưa thực thi SQL trên MySQL |
| QA-B05 | Product 10 giá gốc 500000, sale 300000, tồn 2; ID 999 thiếu | Gọi detail | 404 cho ID thiếu; serialize đúng giá/stock/review | PASS |
| QA-C01 | Giỏ 3 × 500000; totalAmount giả 1; báo giá hợp lệ | Preview và tạo đơn hai lần | Giá giả 400, thiếu quote 409; một đơn và một payment | PASS; tổng 1500000, tồn còn 5 |
| QA-C02 | Đơn của user 1; user 2; admin | Đọc chéo tài khoản; chuyển COD sang DELIVERED | 403 khi đọc/sửa sai quyền; trạng thái hợp lệ chuyển PAID/SUCCESS | PASS |
| QA-D01 | Đơn của người khác/sai sản phẩm/chưa giao/chưa thanh toán; đơn hợp lệ | Save review, sửa, mine tài khoản khác | Không đủ điều kiện 403; ID thiếu 404; sửa giữ một dòng | PASS; rating đổi từ 5 sang 3; người khác không có review |
| QA-D02 | User 1/2, product 10 và ID 999 thiếu | Thêm lặp, list, xóa | Idempotent theo user/product; dữ liệu user 2 còn nguyên | PASS |
| QA-E01 | Payload voucher thiếu/sai kiểu/trắng/âm/spoof userId | POST /coupons/validate | 400 trước nghiệp vụ | PASS sau sửa; trước sửa có 500 |
| QA-E02 | Promotion hợp lệ rồi thay từng trường biên | Save với lịch/tên/banner/items không hợp lệ | BadRequest trước transaction | PASS; 0 transaction |
| QA-E03 | Promotion trùng lịch hoặc product bị xóa | Save trong transaction giả lập | Khóa publication; từ chối trước ghi | PASS; 2 lần yêu cầu khóa, 0 ghi |
| QA-F01 | Product thường/giảm giá/giá 0 | Render ProductPrice | Đúng giá gốc, sale, tiết kiệm; 0 không tạo sale giả | PASS |
| QA-F02 | Cart context loading/rỗng/2 món tổng 600000 | Render CartPage | Loading đúng; giỏ rỗng khóa checkout; dữ liệu đầy đủ hiện tổng | PASS |
| QA-F03 | Auth context loading/guest/USER/ADMIN | Render AdminGuard + router outlet | Chỉ ADMIN thấy nội dung quản trị | PASS; không kiểm tra điều hướng trình duyệt |
| QA-F04 | Form ban đầu | Render LoginPage/RegisterPage | Required/email/password type có trong markup | PASS; chưa submit form bằng DOM |
| QA-F05 | Sản phẩm chưa có đánh giá hoặc 4.3 sao/3 lượt | Render ProductRating | Nhãn truy cập và link đúng | PASS |
| QA-F06 | Axios adapter giả; token đổi sang null; API ném lỗi | Gọi cart/product/coupon/order/login wrappers | Giữ payload/filter, JWT hiện tại; lỗi được propagate | PASS; không có request mạng thật |

Các bộ test tái sử dụng còn kiểm tra snapshot/báo giá thay đổi, giới hạn tồn kho/lượt voucher, rollback sau khi đã ghi order/payment, xác nhận lặp đồng thời trong mô hình bộ nhớ, thanh toán PayOS giả lập và webhook ký thật bằng khóa test, PIN thẻ mô phỏng, moderation chatbot, thao tác nhạy cảm cần xác nhận, cách ly session, AI timeout/mất cấu hình/lỗi JSON và SSE tiếng Việt.

## D. Tổng hợp kết quả và lỗi đã sửa

| Lần chạy | Tổng native test | PASS | FAIL | SKIPPED / CANCELLED |
|---|---:|---:|---:|---:|
| Mốc ban đầu backend | 83 | 83 | 0 | 0 / 0 |
| Mốc ban đầu frontend | 6 | 6 | 0 | 0 / 0 |
| Cuối cùng backend | 106 | 106 | 0 | 0 / 0 |
| Cuối cùng frontend | 12 | 12 | 0 | 0 / 0 |
| Tổng cuối cùng | 118 | 118 | 0 | 0 / 0 |

**Cách đếm:** backend có 101 leaf testcase và 5 test cha chứa subtest; frontend có 12 leaf testcase. Tổng là **113 ca lá**, tương ứng **118 kết quả native Node**. Không cộng test cha thành ca nghiệp vụ độc lập. So với mốc ban đầu tăng 29 kết quả native. Các ca BLOCKED/NOT RUN ở mục E nằm ngoài con số tự động này.

| Lỗi | Mức độ | Bằng chứng trước sửa | Nguyên nhân và thay đổi | Xác minh |
|---|---|---|---|---|
| BUG-01: Đăng ký chấp nhận họ tên rỗng/trắng và thiếu giới hạn chiều dài | Trung bình | [registration-before.tap](test-results/registration-before.tap), [JUnit](test-results/registration-before.xml): QA-A01 nhận 201 thay vì 400 | RegisterDto chỉ kiểm tra string; bổ sung ký tự không trắng, giới hạn họ tên 100, username 50, email 100, phone 15 theo entity | QA-A01/A02 và toàn bộ auth PASS; build backend PASS |
| BUG-02: Payload voucher sai gây HTTP 500 | Trung bình | [coupon-before.tap](test-results/coupon-before.tap), [JUnit](test-results/coupon-before.xml): QA-E01 nhận 500 thay vì 400 | Body dùng type TypeScript nên ValidationPipe không kiểm tra; thêm ValidateCouponDto cho code/orderAmount/productId | QA-E01 PASS; các checkout/coupon sẵn có PASS |

Lần registration trước sửa ghi 3 kết quả FAIL: QA-A01, QA-A02 bị ảnh hưởng do dữ liệu sai đã được lưu ở bước trước, và test cha. Đây là **một lỗi gốc**, không phải ba lỗi độc lập. Lần voucher trước sửa ghi 2 FAIL gồm subtest và test cha, cũng là một lỗi gốc. Thử nghiệm ban đầu của test SQL metadata thiếu tên database trong fixture đã được sửa bằng `qa_metadata_only`, không mở kết nối; đây là lỗi setup test. Custom reporter trên Windows ban đầu dùng đường dẫn C: gây lỗi ESM; đã đổi sang file URL và chạy lại toàn bộ thành công.

| Build | Lệnh thực thi | Kết quả / bằng chứng |
|---|---|---|
| Backend | npm run build → nest build | PASS, exit 0; [output](test-results/backend-build.txt) |
| Frontend | npm run build → tsc -b && vite build | PASS, exit 0; [output](test-results/frontend-build.txt) |

Warning còn lại: Vite báo CJS Node API deprecated và bundle JS 562.05 kB vượt ngưỡng cảnh báo 500 kB. Node 22.8 báo Type Stripping/MockTimers experimental; lần xuất ba reporter có `MaxListenersExceededWarning` của TestsStream. Không tắt warning để làm sạch output; các warning này không làm test/build thất bại và không chứng minh có rò rỉ bộ nhớ trong ứng dụng.

## E. Phạm vi chưa xác minh

| Mã | Loại | Điều kiện / bước cần thực hiện | Mong đợi | Thực tế | Trạng thái |
|---|---|---|---|---|---|
| QA-I01 | MySQL integration | Cấp database test riêng; chạy fixture ORM và transaction, FK/unique/null/rollback | DB thật giữ ràng buộc và rollback đúng | Không có DB test được cấu hình; localhost:3306 ECONNREFUSED. Không dùng `.env` phát triển | BLOCKED |
| QA-I02 | Provider sandbox | Cấu hình tài khoản sandbox và quyền gọi PayOS/Gemini/Resend | Xác minh giao tiếp nhà cung cấp | Chỉ mock; không tạo giao dịch thật, không gửi email thật, không gọi AI có phí | BLOCKED |
| QA-I03 | Browser E2E | Browser/DOM runner; đăng nhập, tìm, thêm giỏ, checkout | Luồng người dùng hoạt động qua UI | Chưa có dependency/browser test; không cài framework lớn. SSR không chạy onSubmit/click/native constraint validation | NOT RUN |
| QA-I04 | Load/performance | Môi trường và workload xác định; đo API dưới tải | Đo p95, throughput, tỷ lệ lỗi với điều kiện rõ | Không đo tải. durationMs trong JSON là thời gian test, không phải latency production | NOT RUN |
| QA-I05 | Manual acceptance | Chạy UI, chụp ảnh và đối chiếu Word/PDF | Có ảnh và biên bản nghiệm thu | Chưa kiểm thử thủ công, chưa chụp ảnh và chưa cập nhật file Word | NOT RUN |

Các hạn chế cụ thể: fixture serialize transaction nên không chứng minh lock isolation/deadlock của InnoDB; upsert/unique trong memory không thay thế kiểm tra constraint thật; các migration test chạy SQL trên connection giả lập. Chưa kiểm thử đồng thời OTP reset trên MySQL, brute-force/rate limiting, thu hồi JWT sau đổi mật khẩu, toàn bộ transition đơn hàng hoặc lỗi database tại từng bước admin cập nhật trạng thái. `revenueSummary` vẫn tính tổng giá trị đơn không hủy thay vì riêng đơn PAID; không thay đổi định nghĩa nghiệp vụ này trong đợt QA.

## F. File thay đổi và tài nguyên bàn giao

- Production: `backend/src/auth/dto/register.dto.ts`, `backend/src/coupon/coupons.controller.ts`, `backend/src/coupon/validate-coupon.dto.ts`.
- Tests backend (trong `tests/backend/`): `auth.http.spec.ts`, `products.spec.ts`, `favorites.spec.ts`, `checkout.spec.ts`, `reviews.spec.ts`, `promotions.spec.ts`; các test cũ cũng được chuyển về đây.
- Frontend: thêm `tests/frontend/ui.test.mjs`.
- Scripts: cập nhật `backend/package.json`, `frontend/package.json`; thêm `tests/run-tests.cjs`, `tests/test-json-reporter.cjs`, `tests/test-case-index.cjs`.
- Tổ chức lại: toàn bộ mã test ở `tests/`, gồm `tests/backend/`, `tests/frontend/` và các công cụ hỗ trợ. Các script `verify-*.cjs` cũng nằm trong `tests/backend/` và vẫn là opt-in; config riêng `tests/tsconfig.backend.json` tái sử dụng dependency backend. Lệnh test theo nhóm xuất file riêng, không ghi đè bằng chứng lần chạy toàn bộ.
- Tài liệu: báo cáo này, [TEST_CASES_FOR_REPORT.md](TEST_CASES_FOR_REPORT.md), cùng `docs/test-results/` (summary, TAP, JUnit, JSONL, catalog và build output).

Các thay đổi có sẵn tại `backend/src/payment/payment.service.ts`, `frontend/src/layouts/AdminLayout.tsx`, `frontend/src/styles/legacy-pages.css`, thư mục artifacts/tools trước đó và ảnh không được chỉnh trong đợt QA này. Không sửa schema dữ liệu thật hoặc cấu hình bảo mật; không thêm dependency. Bằng chứng chứa tên tài khoản/email/khóa test tổng hợp, không ghi giá trị token/OTP/mật khẩu thật vào log.
