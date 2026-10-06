-- Additive migration. Requires existing users, bikes and bike_images tables.
-- Amounts are whole Indian rupees; all DATETIME values are UTC.
CREATE TABLE IF NOT EXISTS auctions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bike_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  starting_price BIGINT UNSIGNED NOT NULL,
  min_increment BIGINT UNSIGNED NOT NULL,
  reserve_price BIGINT UNSIGNED NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  status ENUM('open','closed','cancelled') NOT NULL DEFAULT 'open',
  result ENUM('sold','unsold') NULL,
  highest_bid BIGINT UNSIGNED NULL,
  highest_bidder_id BIGINT UNSIGNED NULL,
  winner_id BIGINT UNSIGNED NULL,
  bid_count INT UNSIGNED NOT NULL DEFAULT 0,
  closed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  active_bike_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'open' THEN bike_id ELSE NULL END) STORED,
  UNIQUE KEY uq_active_auction_bike (active_bike_id),
  KEY idx_auction_deadline (status, ends_at),
  CONSTRAINT fk_auction_bike FOREIGN KEY (bike_id) REFERENCES bikes(id),
  CONSTRAINT fk_auction_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_auction_highest FOREIGN KEY (highest_bidder_id) REFERENCES users(id),
  CONSTRAINT fk_auction_winner FOREIGN KEY (winner_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auction_bids (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auction_id BIGINT UNSIGNED NOT NULL,
  bidder_id BIGINT UNSIGNED NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  request_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_bid_request (bidder_id, request_id),
  KEY idx_auction_bid_history (auction_id, id),
  CONSTRAINT fk_bid_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT fk_bid_user FOREIGN KEY (bidder_id) REFERENCES users(id)
) ENGINE=InnoDB;
