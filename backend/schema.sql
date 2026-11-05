CREATE TABLE IF NOT EXISTS organizations (
  organization_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  msp_id VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(40) NOT NULL,
  address VARCHAR(500) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS actors (
  actor_id VARCHAR(255) PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  fabric_identity TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  actor_type VARCHAR(40) NOT NULL,
  region_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL',
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_actors_organization FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
  UNIQUE KEY uq_actors_fabric_identity (fabric_identity(255)),
  INDEX idx_actors_organization (organization_id)
);

CREATE TABLE IF NOT EXISTS actor_roles (
  actor_id VARCHAR(255) NOT NULL,
  role_code VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (actor_id, role_code),
  CONSTRAINT fk_actor_roles_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id)
);

CREATE TABLE IF NOT EXISTS user_accounts (
  username VARCHAR(80) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  actor_id VARCHAR(255) NULL,
  role_code VARCHAR(40) NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_accounts_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id),
  CONSTRAINT fk_user_accounts_organization FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
  INDEX idx_user_accounts_actor (actor_id)
);

CREATE TABLE IF NOT EXISTS lots (
  lot_id VARCHAR(120) PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL,
  origin VARCHAR(255) NOT NULL,
  harvest_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL,
  current_holder VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_event_id VARCHAR(128) NULL
  ,region_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL'
);

CREATE TABLE IF NOT EXISTS trace_events (
  event_id VARCHAR(128) PRIMARY KEY,
  lot_id VARCHAR(120) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  event_timestamp DATETIME(3) NOT NULL,
  location VARCHAR(255) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  actor_role VARCHAR(40) NOT NULL,
  actor_region VARCHAR(80) NOT NULL DEFAULT 'GLOBAL',
  previous_event_id VARCHAR(128) NULL,
  data_json JSON NOT NULL,
  data_hash CHAR(64) NOT NULL,
  integrity_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_trace_events_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  INDEX idx_trace_events_lot_timestamp (lot_id, event_timestamp)
);

CREATE TABLE IF NOT EXISTS event_documents (
  document_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(128) NULL,
  lot_id VARCHAR(120) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  uploaded_by VARCHAR(120) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_event_documents_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id),
  INDEX idx_event_documents_lot (lot_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_username VARCHAR(80) NOT NULL,
  action_code VARCHAR(100) NOT NULL,
  target_ref VARCHAR(255) NULL,
  details_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_created_at (created_at)
);

INSERT IGNORE INTO organizations (msp_id, name, organization_type, address) VALUES
  ('Org1MSP', 'Nông hộ và sơ chế', 'FARM_PROCESSOR', NULL),
  ('Org2MSP', 'Đơn vị vận chuyển', 'TRANSPORTER', NULL),
  ('Org3MSP', 'Nhà phân phối', 'DISTRIBUTOR', NULL);
