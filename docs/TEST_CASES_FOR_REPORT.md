# Các ca kiểm thử đưa vào báo cáo đồ án

Ngày thực hiện: 27/10/2026 (UTC+7). Nguồn: [TESTING_REPORT.md](TESTING_REPORT.md), [summary.json](test-results/summary.json), [backend JUnit](test-results/backend.xml), [frontend JUnit](test-results/frontend.xml). Tất cả kết quả PASS dưới đây là tự động trên fixture cô lập; không phải kiểm thử thủ công, MySQL thật hoặc nghiệm thu provider.

## Bảng kịch bản KT01–KT15

Mã KT trong bảng này là mã đề xuất để đối chiếu báo cáo Word. Cần so sánh nội dung bảng Word hiện có trước khi thay thế; không mặc định mã KT cũ có cùng nghĩa. Mỗi hàng có thể tổng hợp nhiều assertion/subtest; không cộng 15 hàng thành tổng số testcase tự động.

| Mã | Chức năng / điều kiện trước | Dữ liệu và bước thực hiện | Kết quả mong đợi | Kết quả thực tế | Đạt / Không đạt | Bằng chứng |
|---|---|---|---|---|---|---|
| KT01 | Đăng ký; fixture users ban đầu rỗng | Gửi thông tin hợp lệ; gửi tên rỗng/trắng, email sai, password ngắn, role giả; đăng ký trùng | Hợp lệ tạo USER và băm password; sai dữ liệu 400; trùng 409 | Nhận đúng mã HTTP; không lộ password; input sai không lưu user | Đạt (tự động) | QA-A01/A02, auth.http.spec.ts |
| KT02 | Đăng nhập; tài khoản QA đã tạo | Đăng nhập username/email đúng; sai password hoặc không có user | 201 cho dữ liệu đúng, 401 cho dữ liệu sai | Mã phản hồi đúng với từng trường hợp | Đạt (tự động) | QA-A03 |
| KT03 | Xác thực và quản trị | Gọi /auth/me với JWT thiếu/hỏng/hết hạn/sai chữ ký; gọi API admin dưới anonymous/USER/ADMIN | Hồ sơ bảo vệ bởi JWT; admin trả 401/403/200 theo quyền | Từ chối đúng; token hợp lệ chỉ trả hồ sơ của mình; ADMIN truy cập được stub dashboard | Đạt (tự động) | QA-A04/A05, QA-B01 |
| KT04 | Đổi và khôi phục mật khẩu | Đổi với password hiện tại sai/đúng; cấp OTP, thử sai/hết hạn/chưa verify, verify rồi reset và dùng lại; mock lỗi email | Kiểm tra mật khẩu hiện tại; OTP hiệu lực 5 phút, chỉ reset sau verify và không replay; lỗi email không để token pending | Assertions đúng; mật khẩu cũ không login sau reset, mật khẩu mới login được; OTP không lộ qua response | Đạt (tự động; replay tuần tự) | auth.service.spec.ts; QA-A06–A09 |
| KT05 | Danh sách/tìm kiếm/chi tiết sản phẩm | Keyword/category chứa chuỗi injection và chuỗi trắng; chi tiết ID 10/999 | Query parameter hóa; missing 404; trả đúng giá và tồn | SQL có placeholder và parameter; detail missing 404; giá sale/stock đúng; query không chạy trên MySQL thật | Đạt (tự động, metadata/mocks) | QA-B04/B05; product lookup trong chat.spec.ts |
| KT06 | Giỏ hàng; hai tài khoản, stock 8/10/0 | Thêm/sửa/xóa; quantity 0/âm/lẻ/vượt kho; ID thiếu; spoof userId | Dữ liệu sai không đổi giỏ; thao tác chỉ trong tài khoản đăng nhập | 400/404 đúng; giỏ user 1 không đổi khi user 2 xóa món của mình | Đạt (tự động) | QA-B02/B03 |
| KT07 | Sổ địa chỉ và dữ liệu cá nhân | Đổi địa chỉ mặc định, sửa/xóa địa chỉ chéo tài khoản; cập nhật profile có trường role/card giả | Chỉ sửa tài nguyên của mình; không đổi role/thẻ qua endpoint profile | Chủ sở hữu được cập nhật; địa chỉ khác bị từ chối; profile spoof 400 | Đạt (tự động) | addresses.service.spec.ts; auth.service.spec.ts; user-actions.spec.ts |
| KT08 | Báo giá và đặt hàng | Giỏ 3 × 500000; gửi totalAmount=1; tạo không quote; tạo hai lần từ quote đúng | Không tin giá client; yêu cầu quote; retry không tạo hai đơn | Giá giả 400; thiếu quote 409; một đơn/payment, tổng 1500000, stock còn 5 | Đạt (tự động) | QA-C01 |
| KT09 | Thay đổi giá/giỏ/địa chỉ/voucher; stock/lượt mã cuối | Lập quote rồi thay dữ liệu; hai xác nhận đồng thời trong mô hình bộ nhớ | Yêu cầu xác nhận quote mới; không dùng quá tồn/lượt mã | Không tạo đơn theo quote cũ; mỗi tài nguyên cuối chỉ cấp một lần trong fixture | Đạt (tự động, memory transaction) | checkout.spec.ts: cart/price/address/coupon changes; last stock unit |
| KT10 | Transaction khi checkout thất bại | Gây lỗi sau ghi payment/stock/order, sau đó thử lại | Rollback dữ liệu liên quan; lần thử lại commit một lần | Fixture khôi phục order/items/payment/stock/cart/coupon; retry có một đơn | Đạt (tự động, memory transaction) | checkout.spec.ts: failure after stock/order writes |
| KT11 | Xem đơn và cập nhật trạng thái COD | User 2 đọc đơn user 1; USER sửa trạng thái; ADMIN đặt status sai/DELIVERED | Chặn xem/sửa sai quyền; trạng thái hợp lệ đồng bộ thanh toán | 403/400 theo trường hợp; DELIVERED chuyển order PAID và payment SUCCESS | Đạt (tự động) | QA-C02 |
| KT12 | Voucher và sự kiện ưu đãi | Voucher thiếu/sai/hết hạn/riêng/không đủ tiền/hết lượt; lịch trùng hoặc không hợp lệ; banner sai; product thiếu | Từ chối dữ liệu sai; tính giá theo backend; tránh publication trùng | Input sai 400; điều kiện coupon đúng; promotion invalid không ghi; ưu đãi hết hạn phục hồi giá gốc | Đạt (tự động, mocks) | QA-E01–E03; promotions.spec.ts; checkout.spec.ts |
| KT13 | Đánh giá và yêu thích | Đơn sai chủ/chưa giao/chưa PAID; save review đúng rồi sửa; thêm favorite lặp và xóa ở tài khoản khác | Chỉ người đủ điều kiện được review; một review/favorite mỗi user/product; cách ly user | Không đủ quyền bị từ chối; review sửa giữ một dòng; favorite không nhân đôi hoặc xóa chéo | Đạt (tự động, repository mô hình) | QA-D01/D02; reviews.spec.ts |
| KT14 | Chatbot và thanh toán giả lập | Chào/tìm hàng; action xóa cần confirm; session khác; Gemini lỗi/timeout/thiếu key; PayOS mock, webhook sai/đúng/lặp; PIN card | Giữ phân quyền; không ghi thao tác nhạy cảm khi chưa xác nhận; không báo thành công giả hoặc lộ dữ liệu provider | Các assertion bảo mật/xác nhận/error/SSE và payment mock PASS; không gọi dịch vụ trả phí | Đạt (tự động; provider mock) | chat.spec.ts; shopping.spec.ts; user-actions.spec.ts; checkout.spec.ts |
| KT15 | Giao diện và adapter frontend | SSR giá thường/sale/0, cart loading/rỗng/đủ món, USER/ADMIN, markup form, rating; gọi adapter giả và SSE | Hiển thị trạng thái/giá/required đúng; đúng payload/token; lỗi không bị chuyển thành success; stream không mất chữ | 12 test frontend PASS; chưa thao tác click/submit bằng trình duyệt | Đạt (tự động SSR/API/SSE) | QA-F01–F06; chat-stream.test.mjs |

## Nội dung có thể dùng trong phần kết quả

“Bộ kiểm thử được thực thi bằng Node.js v22.8.0 và node:test trong môi trường Windows. Kết quả ghi nhận 106 kết quả test backend và 12 kết quả test frontend đều thành công, không có kết quả thất bại hoặc bị bỏ qua trong lần chạy cuối. Node tính cả test cha; khi chỉ tính các ca lá, có 101 ca backend và 12 ca frontend. Backend và frontend đều build thành công. Kiểm thử HTTP dùng ứng dụng NestJS trên loopback cùng JWT, guard và ValidationPipe thật, với repository và dịch vụ ngoài giả lập. Kiểm thử giao diện dùng React server rendering, API adapter và stream. Kết quả này chưa bao gồm ràng buộc/khóa MySQL thực, browser E2E, giao tiếp provider thật hoặc đo hiệu năng dưới tải.”

Hai lỗi validation được tái hiện và sửa: đăng ký chấp nhận họ tên rỗng/trắng và API voucher trả HTTP 500 cho payload không hợp lệ. Bằng chứng trước/sau được lưu riêng. Không diễn giải tổng PASS thành tỷ lệ thành công khi vận hành hoặc kết luận “hệ thống không có lỗi bảo mật”.

## Phạm vi cần bổ sung kết quả

| Hạng mục | Kết quả thực tế hiện có | Trạng thái |
|---|---|---|
| MySQL riêng: FK/unique/null, rollback, cạnh tranh khóa thật | Không có DB test; probe localhost:3306 bị từ chối | BLOCKED |
| PayOS/Gemini/Resend sandbox | Chỉ chạy mock, không giao dịch/email/AI thật | BLOCKED |
| Browser E2E: login → search → add cart → checkout | Chưa có môi trường browser/DOM runner | NOT RUN |
| API latency, throughput, concurrent users | Chưa đo; không dùng thời gian chạy test làm số liệu API | NOT RUN |
| Chụp màn hình, nghiệm thu thủ công, rà Word/PDF | Chưa thực hiện | NOT RUN |

## Ảnh bằng chứng đề xuất

Đây là đề xuất chụp sau, không phải ảnh đã có:

- Màn hình output hoặc summary.json thể hiện 106/106 backend, 12/12 frontend và hai build exit 0.
- Phản hồi 400 khi đăng ký tên trắng; 409 khi trùng email; 401/403 cho API bị bảo vệ.
- Báo giá trước khi tạo đơn; thay đổi giá yêu cầu xác nhận lại; hai request cùng quote chỉ có một mã đơn.
- Giỏ/đơn hai tài khoản để minh họa dữ liệu tách biệt, không hiển thị token hoặc thông tin cá nhân thật.
- Voucher không hợp lệ; review chỉ khi đơn đã giao và PAID; status thanh toán COD sau giao.
- Chatbot chờ xác nhận thao tác xóa, fallback khi AI lỗi và bảo toàn tiếng Việt trong SSE.

Khi chụp giao diện và chạy nghiệm thu thủ công, ghi thêm commit/phiên bản mã nguồn, ngày giờ, môi trường, dữ liệu vào, kết quả thực tế và người thực hiện; chỉ điền “Đạt” cho đúng ca đã chạy. Các screenshot UI không thay thế log kiểm thử tự động hoặc bằng chứng transaction database.
