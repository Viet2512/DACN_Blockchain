CREATE TABLE IF NOT EXISTS local_projections (
  lot_id VARCHAR(120) PRIMARY KEY,
  projection_json JSON NOT NULL,
  CONSTRAINT fk_local_projection_lot FOREIGN KEY(lot_id) REFERENCES lots(lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES ('TRANSPORT_RECORD','Record a signed transport checkpoint');
INSERT IGNORE INTO role_permissions(role_code,permission_code) VALUES
 ('FARMER','HANDOVER_CREATE'),('PROCESSOR','HANDOVER_CONFIRM'),
 ('TRANSPORTER','HANDOVER_CREATE'),('TRANSPORTER','TRANSPORT_RECORD'),('DISTRIBUTOR','HANDOVER_CONFIRM');
CREATE TABLE IF NOT EXISTS request_failures (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  organization_id CHAR(36) NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(500) NOT NULL,
  http_status SMALLINT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_failure_time(created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
