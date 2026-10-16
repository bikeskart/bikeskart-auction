-- Apply only after reviewing production backup. Additive inspector phase 1.
CREATE TABLE IF NOT EXISTS inspector_accounts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(150) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS inspector_assignments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 inspector_id BIGINT UNSIGNED NOT NULL,
 bike_id BIGINT UNSIGNED NOT NULL,
 status ENUM('assigned','in_progress','submitted','approved','changes_requested') NOT NULL DEFAULT 'assigned',
 assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_inspector_bike (inspector_id,bike_id),
 KEY idx_inspector_status (inspector_id,status),
 FOREIGN KEY (inspector_id) REFERENCES inspector_accounts(id),
 FOREIGN KEY (bike_id) REFERENCES bikes(id)
) ENGINE=InnoDB;
