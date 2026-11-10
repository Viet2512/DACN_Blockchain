CREATE TABLE IF NOT EXISTS fabric_projections (
  lot_id VARCHAR(120) PRIMARY KEY,
  channel_name VARCHAR(120) NOT NULL,
  chaincode_name VARCHAR(120) NOT NULL,
  projection_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_fabric_projection_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
