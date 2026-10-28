# Gia Dụng Việt

## Thành viên

| Họ và tên        | Mã sinh viên |
| ------------------- | -------------- |
| Nguyễn Quang Hưng | 23010103       |
| Vi Hùng Vương    | 23016891       |


## Tổng quan hệ thống

Gia dụng Việt mô phỏng quy trình mua sắm trực tuyến từ lúc khách tìm sản phẩm đến khi cửa hàng tiếp nhận và xử lý đơn. Người mua có thể duyệt danh mục, tìm kiếm, xem thông tin sản phẩm, lưu sản phẩm yêu thích, quản lý giỏ hàng, áp mã giảm giá và theo dõi đơn hàng. Quản trị viên có thể cập nhật sản phẩm, xử lý đơn, quản lý người dùng và xem báo cáo doanh thu.


Ứng dụng gồm hai thành phần phối hợp với nhau:

- **Frontend:** giao diện React + TypeScript, cung cấp khu vực mua sắm cho khách hàng và trang quản trị.
- **Backend:** REST API xây dựng bằng NestJS, xử lý xác thực, nghiệp vụ cửa hàng, thanh toán và trao đổi dữ liệu với MySQL.
- **Cơ sở dữ liệu:** MySQL, truy cập qua TypeORM; cấu hình kết nối hiện bật SSL.
- **Dịch vụ tích hợp:** PayOS cho thanh toán QR, Gemini cho chatbot và Resend cho email OTP. Các tích hợp này cần thông tin xác thực riêng.

## Chức năng chính

### Dành cho khách hàng

- Tạo tài khoản, đăng nhập, xác thực OTP khi đặt lại mật khẩu và quản lý hồ sơ.
- Duyệt, tìm kiếm và xem chi tiết sản phẩm; xem đánh giá và chương trình khuyến mãi.
- Quản lý giỏ hàng, sản phẩm yêu thích và địa chỉ giao hàng.
- Đặt hàng, áp dụng mã giảm giá, chọn phương thức thanh toán và xem trạng thái đơn.
- Gửi tin nhắn liên hệ với cửa hàng.
- Trao đổi với chatbot để hỏi về sản phẩm và nhận hỗ trợ theo dữ liệu cửa hàng.

### Dành cho quản trị viên

- Xem bảng điều khiển và báo cáo doanh thu.
- Quản lý sản phẩm, chương trình khuyến mãi, mã giảm giá và tài khoản người dùng.
- Theo dõi đơn hàng và cập nhật trạng thái xử lý.
- Tiếp nhận tin nhắn liên hệ.
- Quản lý kho kiến thức của chatbot.

## Luồng hoạt động

### Mua hàng

1. Khách hàng duyệt hoặc tìm sản phẩm trên giao diện React.
2. Frontend gửi yêu cầu đến REST API; NestJS kiểm tra dữ liệu và quyền truy cập.
3. Backend đọc hoặc cập nhật dữ liệu MySQL thông qua TypeORM.
4. Khách hàng xác nhận giỏ hàng, thông tin nhận hàng, mã giảm giá và phương thức thanh toán.
5. Backend tạo đơn hàng cùng bản ghi thanh toán; khách hàng theo dõi đơn trong tài khoản.

### Xác thực và phân quyền

Khi đăng nhập, backend xác minh thông tin và cấp JWT. Frontend gửi JWT trong các yêu cầu cần đăng nhập. Các API quản trị kiểm tra vai trò ADMIN trước khi thực hiện thao tác.

### Thanh toán

- **COD:** đơn hàng được tạo để thanh toán khi nhận hàng.
- **Thẻ mô phỏng:** giao diện xác nhận thẻ phục vụ trình diễn; hệ thống không kết nối ngân hàng và không thu tiền thật.
- **QR qua PayOS:** backend tạo liên kết thanh toán và xác minh kết quả từ PayOS/webhook trước khi cập nhật trạng thái.

### Chatbot và email

Chatbot có thể sử dụng Gemini và dữ liệu kiến thức do quản trị viên quản lý. Email OTP cần cấu hình Resend. Nếu chưa cung cấp khóa dịch vụ, các chức năng phụ thuộc dịch vụ đó sẽ không hoạt động đầy đủ.

## Công nghệ

| Thành phần   | Công nghệ                              |
| -------------- | ---------------------------------------- |
| Giao diện     | React 19, TypeScript, Vite, React Router |
| API            | NestJS 11, TypeScript, REST              |
| Dữ liệu      | MySQL, TypeORM                           |
| Xác thực     | JWT, phân quyền USER/ADMIN             |
| Thanh toán QR | PayOS                                    |
| Chatbot        | Google Gemini                            |
| Email          | Resend                                   |

## Yêu cầu trước khi chạy

- Node.js **22 trở lên** và npm.
- MySQL tương thích, cùng thông tin máy chủ, tài khoản và cơ sở dữ liệu.
- Git để lấy mã nguồn (nếu chưa có dự án trên máy).

## Khởi động dự án trên máy mới

### 1. Tạo và nạp cơ sở dữ liệu

Tạo database bằng file `database/schema.sql` (file có lệnh tạo database `giadung_shop` và dữ liệu khởi tạo). Có thể chạy từ MySQL Workbench hoặc dòng lệnh:

```bash
mysql -u root -p < database/schema.sql
```

Nếu dùng MySQL cục bộ, đảm bảo MySQL đang chạy và database/tài khoản trong file cấu hình khớp với máy của bạn. Kết nối backend hiện cấu hình SSL; môi trường MySQL không hỗ trợ SSL có thể cần điều chỉnh cấu hình trong `backend/src/database/database.module.ts`.

### 2. Cấu hình backend

Tạo file `backend/.env` (không đưa file này lên Git) với các giá trị phù hợp:

```env
PORT=3000
FRONTEND_URL=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_mysql_password
DB_NAME=giadung_shop
DB_SYNCHRONIZE=false

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d

# Điền nếu sử dụng thanh toán QR PayOS
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_RETURN_URL=http://localhost:5173/checkout/success
PAYOS_CANCEL_URL=http://localhost:5173/checkout/success
# Điền thêm để PayOS có thể gửi thanh toán thành công tới backend thông qua NGROK
NGROK_URL=

# Tùy chọn: chatbot AI và email OTP
GEMINI_API_KEY=
RESEND_API_KEY=
MAIL_FROM=onboarding@resend.dev
```

Các script bổ sung schema cũng đọc cấu hình kết nối từ file này. Sau khi nạp schema cơ sở, chạy các bước cập nhật schema để tạo/cập nhật bảng cho những chức năng mở rộng:

```bash
cd backend
npm install
npm run db:auth-profile
npm run db:chatbot
npm run db:reviews
npm run db:promotions
npm run db:checkout
```

Các lệnh này chỉ cần chạy khi thiết lập database hoặc khi dự án yêu cầu cập nhật schema. Đặt `DB_SYNCHRONIZE=false`; dự án dùng các script cập nhật tường minh thay vì tự đồng bộ toàn bộ entity khi khởi động.

### 3. Cấu hình và chạy backend

Tạo `backend/.env` như bước trên, sau đó trong thư mục `backend`:

```bash
npm run start:dev
```

Backend chạy tại `http://localhost:3000`; API có tiền tố `/api`.

### 4. Cấu hình và chạy frontend

Tạo file `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

Mở terminal mới và chạy:

```bash
cd frontend
npm install
npm run dev
```

Mở địa chỉ được Vite hiển thị (mặc định là **http://localhost:5173**). Để sử dụng ứng dụng, giữ cả backend và frontend chạy đồng thời.

## Tài khoản và dữ liệu trình diễn

File `database/schema.sql` cung cấp dữ liệu khởi tạo. Hãy kiểm tra tài khoản mẫu trực tiếp trong file SQL trước khi đăng nhập; nếu không có tài khoản phù hợp, đăng ký tài khoản mới và cấp vai trò ADMIN trong database khi cần trình diễn khu vực quản trị. Không sử dụng mật khẩu mẫu trên môi trường công khai.

## Build ứng dụng

Chạy riêng trong từng thư mục:

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

## Cấu trúc mã nguồn

```text
backend/
  src/
    admin/       Dashboard và nghiệp vụ quản trị
    auth/        Đăng ký, đăng nhập, hồ sơ, JWT
    chat/        Chatbot, hội thoại và kiến thức
    database/    Cấu hình TypeORM và entity
    orders/      Đơn hàng
    payment/     Thanh toán và PayOS
    products/    Sản phẩm
    promotions/  Chương trình khuyến mãi
    reviews/     Đánh giá sản phẩm
  scripts/       Script thiết lập/cập nhật schema
frontend/
  src/
    api/         Giao tiếp với backend
    components/  Thành phần giao diện tái sử dụng
    context/     Trạng thái đăng nhập và giỏ hàng
    layouts/     Bố cục khách hàng và quản trị
    pages/       Các trang của ứng dụng
database/
  schema.sql     Schema cơ sở và dữ liệu khởi tạo
  *.sql          Schema bổ sung cho các chức năng mở rộng
```

## Ghi chú khi trình diễn

- Muốn thanh toán QR cập nhật tự động, cần thông tin PayOS hợp lệ và webhook có thể truy cập từ Internet; endpoint webhook là `/api/payment/payos/webhook`.
- Thanh toán thẻ hiện chỉ mô phỏng luồng xác nhận, không tạo giao dịch ngân hàng thật.
- Chatbot Gemini và email OTP cần lần lượt có `GEMINI_API_KEY` và thông tin Resend hợp lệ.
- Ảnh sản phẩm tải lên được backend phục vụ từ đường dẫn `/uploads`.
