CREATE TABLE IF NOT EXISTS lot_records (
  record_id CHAR(36) PRIMARY KEY,
  lot_id VARCHAR(120) NOT NULL,
  record_type VARCHAR(40) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  data_json JSON NOT NULL,
  created_by VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_lot_records_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  INDEX idx_lot_records_type (lot_id, record_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
