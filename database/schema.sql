-- BikesKart Auction Stage 1 reference schema.
-- IMPORTANT: The production database already exists. Do NOT run this file
-- unless specifically instructed. It intentionally does not CREATE DATABASE.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('admin','dealer','bidder') NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(20) NULL,
  password_hash VARCHAR(255) NOT NULL,
  business_name VARCHAR(190) NULL,
  gst_number VARCHAR(20) NULL,
  kyc_document_url VARCHAR(500) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Reference only: review against the existing production tables before applying.
CREATE TABLE IF NOT EXISTS bikes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dealer_id BIGINT UNSIGNED NOT NULL,
  brand VARCHAR(150) NOT NULL,
  model VARCHAR(150) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  registration_number VARCHAR(30) NULL,
  kilometers_driven INT UNSIGNED NULL,
  ownership_count TINYINT UNSIGNED NULL,
  fuel_type VARCHAR(30) NULL,
  condition_notes TEXT NULL,
  rc_document_url VARCHAR(500) NULL,
  status ENUM('draft','ready','in_auction','sold','unsold') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bikes_status (status),
  CONSTRAINT fk_bikes_user FOREIGN KEY (dealer_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bike_images (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bike_id BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  KEY idx_bike_images_order (bike_id, sort_order),
  CONSTRAINT fk_images_bike FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE
) ENGINE=InnoDB;
