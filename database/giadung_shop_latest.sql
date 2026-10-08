-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: mysql-webnc-vuongvidlls-0576.e.aivencloud.com    Database: giadung_shop
-- ------------------------------------------------------
-- Server version	8.4.8

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '24d9ec94-aaae-11f1-b672-9eb644d1aaf1:1-37,
e7af24ed-b5a5-11f1-806f-2628510f0ea5:1-30,
f3476d07-b670-11f1-a63b-fae467647da8:1-97';

--
-- Table structure for table `cart_items`
--

DROP TABLE IF EXISTS `cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cart_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `cart_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `FK_6385a745d9e12a89b859bb25623` (`cart_id`),
  KEY `FK_30e89257a105eab7648a35c7fce` (`product_id`),
  CONSTRAINT `FK_30e89257a105eab7648a35c7fce` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_6385a745d9e12a89b859bb25623` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `cart_items`
--

LOCK TABLES `cart_items` WRITE;
/*!40000 ALTER TABLE `cart_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `carts`
--

DROP TABLE IF EXISTS `carts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `carts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_2ec1c94a977b940d85a4f498ae` (`user_id`),
  UNIQUE KEY `REL_2ec1c94a977b940d85a4f498ae` (`user_id`),
  CONSTRAINT `FK_2ec1c94a977b940d85a4f498aea` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `carts`
--

LOCK TABLES `carts` WRITE;
/*!40000 ALTER TABLE `carts` DISABLE KEYS */;
INSERT INTO `carts` VALUES (1,1,'2026-09-21 10:39:30.000000','2026-09-21 10:39:30.000000'),(2,2,'2026-09-21 11:15:49.000000','2026-09-21 11:15:49.000000'),(3,3,'2026-09-23 05:09:01.000000','2026-09-23 05:09:01.000000');
/*!40000 ALTER TABLE `carts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contact_messages`
--

DROP TABLE IF EXISTS `contact_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contact_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contact_messages`
--

LOCK TABLES `contact_messages` WRITE;
/*!40000 ALTER TABLE `contact_messages` DISABLE KEYS */;
INSERT INTO `contact_messages` VALUES (1,'vuong vii','vuongvidlls@gmail.com','0327954569','bla bla',1,'2026-09-23 04:21:51.000000');
/*!40000 ALTER TABLE `contact_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coupons`
--

DROP TABLE IF EXISTS `coupons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coupons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `discountType` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'percentage',
  `discountValue` decimal(12,2) NOT NULL,
  `minOrderAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `maxDiscountAmount` decimal(12,2) DEFAULT NULL,
  `usageLimit` int DEFAULT NULL,
  `usedCount` int NOT NULL DEFAULT '0',
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coupons`
--

LOCK TABLES `coupons` WRITE;
/*!40000 ALTER TABLE `coupons` DISABLE KEYS */;
INSERT INTO `coupons` VALUES (1,'GIAM10','Giảm 10% cho đơn hàng','percentage',10.00,200000.00,50000.00,100,0,'2026-09-23 00:00:00','2026-10-31 23:59:59',1,'2026-09-23 03:28:45','2026-09-23 03:28:45');
/*!40000 ALTER TABLE `coupons` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `migrations`
--

DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timestamp` bigint NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `migrations`
--

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,1730000000000,'CreatePasswordResetTokens1730000000000'),(2,1790200000000,'AddPayosPaymentMethod1790200000000');
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `order_items`
--

DROP TABLE IF EXISTS `order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `order_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `order_id` bigint NOT NULL,
  `product_id` bigint DEFAULT NULL,
  `product_name` varchar(200) NOT NULL,
  `product_image` varchar(500) DEFAULT NULL,
  `price` decimal(15,0) NOT NULL,
  `quantity` int NOT NULL,
  `subtotal` decimal(15,0) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_145532db85752b29c57d2b7b1f1` (`order_id`),
  KEY `FK_9263386c35b6b242540f9493b00` (`product_id`),
  CONSTRAINT `FK_145532db85752b29c57d2b7b1f1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `FK_9263386c35b6b242540f9493b00` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `order_items`
--

LOCK TABLES `order_items` WRITE;
/*!40000 ALTER TABLE `order_items` DISABLE KEYS */;
INSERT INTO `order_items` VALUES (1,1,7,'Quạt đứng Panasonic 5 cánh','https://images.unsplash.com/photo-1565031491910-e57fac031c41?auto=format&fit=crop&w=900&q=85',1790000,2,3580000),(2,2,8,'Máy lọc không khí Sharp FP-J40E','https://dieuhoanhapkhau.vn/uploads/images/may-loc-khong-khi-sharp-fp-j40e-w.jpg',3690000,1,3690000),(3,3,9,'Test','https://d8iqbmvu05s9c.cloudfront.net/ajprhqgqg1otf7d5sm7u3brf27gv',10000,1,10000),(4,4,9,'Test','https://d8iqbmvu05s9c.cloudfront.net/ajprhqgqg1otf7d5sm7u3brf27gv',10000,1,10000);
/*!40000 ALTER TABLE `order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orders`
--

DROP TABLE IF EXISTS `orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `phone` varchar(15) NOT NULL,
  `address` text NOT NULL,
  `total_amount` decimal(15,0) NOT NULL,
  `subtotal_amount` decimal(15,0) NOT NULL DEFAULT '0',
  `discount_amount` decimal(15,0) NOT NULL DEFAULT '0',
  `coupon_code` varchar(50) DEFAULT NULL,
  `status` enum('PENDING','CONFIRMED','DELIVERED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `payment_method` enum('QR','CARD','CASH','PAYOS') NOT NULL,
  `payment_status` enum('UNPAID','PAID') NOT NULL DEFAULT 'UNPAID',
  `note` text,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `FK_a922b820eeef29ac1c6800e826a` (`user_id`),
  CONSTRAINT `FK_a922b820eeef29ac1c6800e826a` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orders`
--

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
INSERT INTO `orders` VALUES (1,2,'Nguyễn','khiemkk3663@gmail.com','0368328669','sdksfkslka',3580000,3580000,0,NULL,'DELIVERED','QR','PAID','','2026-09-23 04:18:39.000000','2026-09-23 17:47:12.000000'),(2,3,'vuong','vuongvidlls@gmail.com','0327954569','sdsads',3690000,3690000,0,NULL,'CANCELLED','PAYOS','UNPAID','','2026-09-23 17:45:21.000000','2026-09-24 11:58:27.000000'),(3,3,'vuong','vuongvidlls@gmail.com','0327954569','dfdfgfdg',10000,10000,0,NULL,'DELIVERED','PAYOS','UNPAID','','2026-09-23 17:50:59.000000','2026-09-24 11:57:52.000000'),(4,3,'vuong','vuongvidlls@gmail.com','0327954569','dslfsdlflds',10000,10000,0,NULL,'PENDING','CASH','UNPAID','','2026-09-24 12:00:06.551245','2026-09-24 12:00:06.551245');
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_reset_tokens`
--

DROP TABLE IF EXISTS `password_reset_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_tokens` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `otp_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `FK_52ac39dd8a28730c63aeb428c9c` (`user_id`),
  CONSTRAINT `FK_52ac39dd8a28730c63aeb428c9c` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_tokens`
--

LOCK TABLES `password_reset_tokens` WRITE;
/*!40000 ALTER TABLE `password_reset_tokens` DISABLE KEYS */;
INSERT INTO `password_reset_tokens` VALUES (1,3,'$2b$10$C2qLxunzANghr.IYxqYb3uDAP3PYcSVslgIng6bttLrjdEw1CCa0.','2026-09-23 12:14:11','2026-09-23 12:09:37','2026-09-23 12:09:49','2026-09-23 05:09:11.000000'),(2,3,'$2b$10$05RtRsnIbRRymn7Bl3yxQucWwDMwpiEaoJmPxrIl/pTBrAwEEYPQu','2026-09-23 22:25:05',NULL,'2026-09-23 22:20:51','2026-09-23 15:20:05.000000'),(3,3,'$2b$10$rBNKIo4r137h2BP4Lo0IY.MOGQL9fj0E7zm8Qtb3TCIcrb6QNoNae','2026-09-23 22:25:52','2026-09-23 22:22:47','2026-09-23 22:22:57','2026-09-23 15:20:52.000000');
/*!40000 ALTER TABLE `password_reset_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `order_id` bigint NOT NULL,
  `method` enum('QR','CARD','CASH','PAYOS') NOT NULL,
  `amount` decimal(15,0) NOT NULL,
  `status` enum('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `transaction_id` varchar(100) DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_b2f7b823a21562eeca20e72b00` (`order_id`),
  UNIQUE KEY `REL_b2f7b823a21562eeca20e72b00` (`order_id`),
  CONSTRAINT `FK_b2f7b823a21562eeca20e72b006` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (1,1,'QR',3580000,'SUCCESS','OFFLINE-1','2026-09-23 11:18:40','2026-09-23 04:18:40.000000'),(2,2,'PAYOS',3690000,'PENDING',NULL,NULL,'2026-09-23 17:45:22.000000'),(3,3,'PAYOS',10000,'PENDING',NULL,NULL,'2026-09-23 17:50:59.000000'),(4,4,'CASH',10000,'PENDING',NULL,NULL,'2026-09-24 12:00:07.040140');
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `products` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `description` text,
  `specifications` text,
  `origin` varchar(100) DEFAULT NULL,
  `price` decimal(15,0) NOT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `category` varchar(100) DEFAULT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `is_featured` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (1,'Nồi cơm điện Toshiba 1.8L','Nồi cơm điện Toshiba dung tích 1.8L, thiết kế gọn gàng, phù hợp gia đình 3-5 người.','Dung tích: 1.8L\nCông suất: 700W\nLòng nồi: Chống dính\nChức năng: Nấu, giữ ấm\nPhù hợp: 3-5 người','Nhật Bản',1590000,30,'Nồi cơm điện','Toshiba','https://cdn.tgdd.vn/Products/Images/1922/220502/noi-com-nap-gai-toshiba-rc-18jh2pv-b-18l-1-org.jpg',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(2,'Máy xay sinh tố Philips HR2223','Máy xay sinh tố Philips công suất mạnh, dễ sử dụng cho sinh tố, nước sốt và thực phẩm gia đình.','Công suất: 700W\nDung tích cối: 1.5L\nLưỡi dao: Inox\nTốc độ: 5 mức + nhồi\nChất liệu cối: Nhựa cao cấp','Hà Lan',1290000,45,'Máy xay sinh tố','Philips','https://dienmayquanghanh.com/Upload/avatar/ava-hr2223.jpg',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(3,'Nồi chiên không dầu LocknLock 5.2L','Nồi chiên không dầu dung tích lớn, giúp chế biến món chiên giòn với ít dầu.','Dung tích: 5.2L\nCông suất: 1800W\nNhiệt độ: 80-200°C\nHẹn giờ: 60 phút\nMàn hình: Điện tử','Hàn Quốc',2190000,35,'Đồ dùng nhà bếp','LocknLock','https://dienmayquanghanh.com/Upload/avatar/avatar%20san%20pham%201/ava-philips-62-lit-na130.jpg',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(4,'Lò vi sóng Sharp 20L','Lò vi sóng Sharp 20L nhỏ gọn, thuận tiện hâm nóng và chế biến món ăn hàng ngày.','Dung tích: 20L\nCông suất vi sóng: 800W\nĐiều khiển: Cơ\nHẹn giờ: 30 phút\nChức năng: Hâm nóng, rã đông','Nhật Bản',1890000,25,'Đồ dùng nhà bếp','Sharp','https://dienmaytienphong.com/wp-content/uploads/2026/02/R-2040EH-BK.jpg',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(5,'Máy hút bụi Deerma DX700','Máy hút bụi cầm tay nhỏ gọn, dễ sử dụng cho sàn nhà, sofa và các khu vực nhỏ.','Công suất: 600W\nLực hút: 15000Pa\nDung tích hộp bụi: 0.8L\nLoại: Cầm tay\nBộ lọc: HEPA','Trung Quốc',890000,60,'Máy hút bụi','Deerma','https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=900&q=85',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(6,'Robot hút bụi Xiaomi S20','Robot hút bụi thông minh hỗ trợ hút và lau nhà, điều khiển tiện lợi qua ứng dụng.','Lực hút: 5000Pa\nThời gian hoạt động: 130 phút\nĐiều khiển: App\nChức năng: Hút + lau\nĐiều hướng: LDS','Trung Quốc',6490000,18,'Thiết bị gia dụng thông minh','Xiaomi','https://caothienphat.com/wp-content/uploads/2025/04/Dreame-1-768x768.jpg',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(7,'Quạt đứng Panasonic 5 cánh','Quạt đứng Panasonic vận hành êm, tạo luồng gió dễ chịu cho phòng ngủ và phòng khách.','Số cánh: 5\nCông suất: 48W\nTốc độ: 3 mức\nChiều cao: Điều chỉnh\nHẹn giờ: Có','Nhật Bản',1790000,40,'Quạt điện','Panasonic','https://images.unsplash.com/photo-1565031491910-e57fac031c41?auto=format&fit=crop&w=900&q=85',1,'2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(8,'Máy lọc không khí Sharp FP-J40E','Máy lọc không khí Sharp phù hợp phòng gia đình, hỗ trợ lọc bụi và khử mùi.','Diện tích: 30m²\r\nCông nghệ: Plasmacluster\r\nBộ lọc: HEPA\r\nCông suất: 23W\r\nĐộ ồn: Thấp','Nhật Bản',3690000,21,'Thiết bị gia dụng thông minh','Sharp','https://dieuhoanhapkhau.vn/uploads/images/may-loc-khong-khi-sharp-fp-j40e-w.jpg',1,'2026-09-21 10:24:26.000000','2026-09-23 17:45:21.000000'),(9,'Test','','','',10000,0,'','Sharp','https://d8iqbmvu05s9c.cloudfront.net/ajprhqgqg1otf7d5sm7u3brf27gv',0,'2026-09-23 17:49:02.000000','2026-09-24 12:00:06.000000');
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `username` varchar(50) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(15) DEFAULT NULL,
  `role` enum('USER','ADMIN') NOT NULL DEFAULT 'USER',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_97672ac88f789774dd47f7c8be` (`email`),
  UNIQUE KEY `IDX_fe0bb3f6520ee0469504521e71` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Admin','admin','admin@shop.com','$2y$10$LWQZYFzJIEAHz82DT/FyMuruKVE.Aai.mteU4aZEdIEyUnbZa5K1G','0123456789','ADMIN','2026-09-21 10:24:26.000000','2026-09-21 10:24:26.000000'),(2,'Nguyễn','Khiêm','khiemkk3663@gmail.com','$2b$10$tJtmcrCTv.CVZJBmTPAVkOYpFza7cFY6aSH6HFasVA.VOfib7TN32','0368328669','USER','2026-09-21 11:15:48.000000','2026-09-21 11:15:48.000000'),(3,'vuong','vii','vuongvidlls@gmail.com','$2b$10$yCt5i3tWAdA36n2cGeJMou75e9nVMJaQZPeWuRgA4rA0WlKnHpNQ6','0327954569','USER','2026-09-23 05:09:00.000000','2026-09-23 15:22:57.000000');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-24 19:41:42
