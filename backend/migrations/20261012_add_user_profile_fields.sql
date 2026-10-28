-- Bổ sung dữ liệu hồ sơ, không thay đổi hoặc xóa dữ liệu người dùng hiện có.
SET @add_birth_date = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'birth_date'
  ),
  'SELECT 1',
  'ALTER TABLE `users` ADD COLUMN `birth_date` DATE NULL AFTER `phone`'
);
PREPARE statement FROM @add_birth_date;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @add_gender = IF(
  EXISTS(
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'gender'
  ),
  'SELECT 1',
  'ALTER TABLE `users` ADD COLUMN `gender` ENUM(''male'', ''female'', ''other'') NULL AFTER `birth_date`'
);
PREPARE statement FROM @add_gender;
EXECUTE statement;
DEALLOCATE PREPARE statement;
