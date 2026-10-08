-- file chứa cấu trúc database sql gồm các bảng, khóa và dữ liệu khởi tạo cần thiết.
-- ==========================================
-- TẠO DATABASE
-- ==========================================
CREATE DATABASE IF NOT EXISTS giadung_shop
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE giadung_shop;

-- ==========================================
-- BẢNG USERS (người dùng + admin)
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name   VARCHAR(100) NOT NULL,
    username    VARCHAR(50) UNIQUE,
    email       VARCHAR(100) NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,
    phone       VARCHAR(15),
    role        ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BANG USER_ADDRESSES
-- ==========================================
CREATE TABLE IF NOT EXISTS user_addresses (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    full_name   VARCHAR(100) NOT NULL,
    phone       VARCHAR(15) NOT NULL,
    address     TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG CONTACT_MESSAGES (tin nhắn liên hệ)
-- ==========================================
CREATE TABLE IF NOT EXISTS contact_messages (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(100) NOT NULL,
    phone       VARCHAR(20),
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG PRODUCTS (sản phẩm)
-- ==========================================
CREATE TABLE IF NOT EXISTS products (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    specifications  TEXT,                         -- thông số kỹ thuật
    origin          VARCHAR(100),                 -- xuất xứ
    price           DECIMAL(15, 0) NOT NULL,
    stock           INT NOT NULL DEFAULT 0,
    category        VARCHAR(100),
    brand           VARCHAR(100),
    image_url       VARCHAR(500),
    is_featured     BOOLEAN DEFAULT FALSE,        -- sản phẩm nổi bật trang chủ
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BANG FAVORITES
-- ==========================================
CREATE TABLE IF NOT EXISTS favorites (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    product_id  BIGINT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_favorite_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG CARTS (giỏ hàng - mỗi user 1 cart)
-- ==========================================
CREATE TABLE IF NOT EXISTS carts (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG CART_ITEMS (sản phẩm trong giỏ)
-- ==========================================
CREATE TABLE IF NOT EXISTS cart_items (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    cart_id     BIGINT NOT NULL,
    product_id  BIGINT NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_cart_product (cart_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG ORDERS (đơn hàng)
-- ==========================================
CREATE TABLE IF NOT EXISTS orders (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT NOT NULL,
    full_name           VARCHAR(100) NOT NULL,    -- thông tin thanh toán
    email               VARCHAR(100) NOT NULL,
    phone               VARCHAR(15) NOT NULL,
    address             TEXT NOT NULL,
    total_amount        DECIMAL(15, 0) NOT NULL,
    subtotal_amount     DECIMAL(15, 0) NOT NULL DEFAULT 0,
    discount_amount     DECIMAL(15, 0) NOT NULL DEFAULT 0,
    coupon_code         VARCHAR(50) NULL,
    status              ENUM('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED')
                        NOT NULL DEFAULT 'PENDING',
    payment_method      ENUM('QR', 'CARD', 'CASH') NOT NULL,
    payment_status      ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
    note                TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS coupons (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    code                VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT NULL,
    `discountType`      ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    `discountValue`     DECIMAL(12, 2) NOT NULL,
    `minOrderAmount`    DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `maxDiscountAmount` DECIMAL(12, 2) NULL,
    `usageLimit`        INT NULL,
    `usedCount`         INT NOT NULL DEFAULT 0,
    `startDate`         DATETIME NOT NULL,
    `endDate`           DATETIME NOT NULL,
    `isActive`          TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updatedAt`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG ORDER_ITEMS (sản phẩm trong đơn hàng)
-- ==========================================
CREATE TABLE IF NOT EXISTS order_items (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id    BIGINT NOT NULL,
    product_id  BIGINT,
    product_name    VARCHAR(200) NOT NULL,        -- lưu tên lúc mua (tránh mất khi xóa SP)
    product_image   VARCHAR(500),
    price           DECIMAL(15, 0) NOT NULL,      -- giá lúc mua
    quantity        INT NOT NULL,
    subtotal        DECIMAL(15, 0) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- BẢNG PAYMENTS (thanh toán)
-- ==========================================
CREATE TABLE IF NOT EXISTS payments (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT NOT NULL UNIQUE,
    method          ENUM('QR', 'CARD', 'CASH') NOT NULL,
    amount          DECIMAL(15, 0) NOT NULL,
    status          ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    transaction_id  VARCHAR(100),                 -- mã giao dịch (nếu có)
    paid_at         DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- DỮ LIỆU MẪU - ADMIN
-- Password: admin123 (đã bcrypt)
-- ==========================================
INSERT INTO users (full_name, username, email, password, phone, role) VALUES
('Admin', 'admin', 'admin@shop.com', '$2y$10$LWQZYFzJIEAHz82DT/FyMuruKVE.Aai.mteU4aZEdIEyUnbZa5K1G', '0123456789', 'ADMIN');

-- ==========================================
-- DỮ LIỆU MẪU - SẢN PHẨM GIA DỤNG
-- ==========================================
INSERT INTO products (name, description, specifications, origin, price, stock, category, brand, image_url, is_featured) VALUES
('Nồi cơm điện Toshiba 1.8L', 'Nồi cơm điện Toshiba dung tích 1.8L, thiết kế gọn gàng, phù hợp gia đình 3-5 người.', 'Dung tích: 1.8L\nCông suất: 700W\nLòng nồi: Chống dính\nChức năng: Nấu, giữ ấm\nPhù hợp: 3-5 người', 'Nhật Bản', 1590000, 30, 'Nồi cơm điện', 'Toshiba', 'https://cdn.tgdd.vn/Products/Images/1922/220502/noi-com-nap-gai-toshiba-rc-18jh2pv-b-18l-1-org.jpg', TRUE),
('Máy xay sinh tố Philips HR2223', 'Máy xay sinh tố Philips công suất mạnh, dễ sử dụng cho sinh tố, nước sốt và thực phẩm gia đình.', 'Công suất: 700W\nDung tích cối: 1.5L\nLưỡi dao: Inox\nTốc độ: 5 mức + nhồi\nChất liệu cối: Nhựa cao cấp', 'Hà Lan', 1290000, 45, 'Máy xay sinh tố', 'Philips', 'https://dienmayquanghanh.com/Upload/avatar/ava-hr2223.jpg', TRUE),
('Nồi chiên không dầu LocknLock 5.2L', 'Nồi chiên không dầu dung tích lớn, giúp chế biến món chiên giòn với ít dầu.', 'Dung tích: 5.2L\nCông suất: 1800W\nNhiệt độ: 80-200°C\nHẹn giờ: 60 phút\nMàn hình: Điện tử', 'Hàn Quốc', 2190000, 35, 'Đồ dùng nhà bếp', 'LocknLock', 'https://dienmayquanghanh.com/Upload/avatar/avatar%20san%20pham%201/ava-philips-62-lit-na130.jpg', TRUE),
('Lò vi sóng Sharp 20L', 'Lò vi sóng Sharp 20L nhỏ gọn, thuận tiện hâm nóng và chế biến món ăn hàng ngày.', 'Dung tích: 20L\nCông suất vi sóng: 800W\nĐiều khiển: Cơ\nHẹn giờ: 30 phút\nChức năng: Hâm nóng, rã đông', 'Nhật Bản', 1890000, 25, 'Đồ dùng nhà bếp', 'Sharp', 'https://dienmaytienphong.com/wp-content/uploads/2026/02/R-2040EH-BK.jpg', TRUE),
('Máy hút bụi Deerma DX700', 'Máy hút bụi cầm tay nhỏ gọn, dễ sử dụng cho sàn nhà, sofa và các khu vực nhỏ.', 'Công suất: 600W\nLực hút: 15000Pa\nDung tích hộp bụi: 0.8L\nLoại: Cầm tay\nBộ lọc: HEPA', 'Trung Quốc', 890000, 60, 'Máy hút bụi', 'Deerma', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=85', TRUE),
('Robot hút bụi Xiaomi S20', 'Robot hút bụi thông minh hỗ trợ hút và lau nhà, điều khiển tiện lợi qua ứng dụng.', 'Lực hút: 5000Pa\nThời gian hoạt động: 130 phút\nĐiều khiển: App\nChức năng: Hút + lau\nĐiều hướng: LDS', 'Trung Quốc', 6490000, 18, 'Thiết bị gia dụng thông minh', 'Xiaomi', 'https://caothienphat.com/wp-content/uploads/2025/04/Dreame-1-768x768.jpg', TRUE),
('Quạt đứng Panasonic 5 cánh', 'Quạt đứng Panasonic vận hành êm, tạo luồng gió dễ chịu cho phòng ngủ và phòng khách.', 'Số cánh: 5\nCông suất: 48W\nTốc độ: 3 mức\nChiều cao: Điều chỉnh\nHẹn giờ: Có', 'Nhật Bản', 1790000, 40, 'Quạt điện', 'Panasonic', 'https://images.unsplash.com/photo-1565031491910-e57fac031c41?auto=format&fit=crop&w=900&q=85', TRUE),
('Máy lọc không khí Sharp FP-J40E', 'Máy lọc không khí Sharp phù hợp phòng gia đình, hỗ trợ lọc bụi và khử mùi.', 'Diện tích: 30m²\nCông nghệ: Plasmacluster\nBộ lọc: HEPA\nCông suất: 23W\nĐộ ồn: Thấp', 'Nhật Bản', 3690000, 22, 'Thiết bị gia dụng thông minh', 'Sharp', 'https://images.unsplash.com/photo-1585776245991-cf89dd7fc73a?auto=format&fit=crop&w=900&q=85', TRUE);
