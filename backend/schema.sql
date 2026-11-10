CREATE TABLE IF NOT EXISTS organizations (
  organization_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  msp_id VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(40) NOT NULL,
  address VARCHAR(500) NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS actor_roles (
  actor_id VARCHAR(255) NOT NULL,
  role_code VARCHAR(40) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (actor_id, role_code),
  CONSTRAINT fk_actor_roles_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_accounts (
  username VARCHAR(80) PRIMARY KEY,
  password_hash VARCHAR(255) NOT NULL,
  actor_id VARCHAR(255) NULL,
  role_code VARCHAR(40) NOT NULL,
  organization_id BIGINT UNSIGNED NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'PENDING_ACTIVATION') NOT NULL DEFAULT 'ACTIVE',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_accounts_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id),
  CONSTRAINT fk_user_accounts_organization FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
  INDEX idx_user_accounts_actor (actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS lots (
  lot_id VARCHAR(120) PRIMARY KEY,
  product_name VARCHAR(255) NOT NULL,
  origin VARCHAR(255) NOT NULL,
  harvest_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL,
  current_holder VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_event_id VARCHAR(128) NULL,
  region_code VARCHAR(80) NOT NULL DEFAULT 'GLOBAL'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_username VARCHAR(80) NOT NULL,
  action_code VARCHAR(100) NOT NULL,
  target_ref VARCHAR(255) NULL,
  details_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO organizations (msp_id, name, organization_type, address) VALUES
  ('Org1MSP', 'Nông hộ và sơ chế', 'FARM_PROCESSOR', NULL),
  ('Org2MSP', 'Đơn vị vận chuyển', 'TRANSPORTER', NULL),
  ('Org3MSP', 'Nhà phân phối', 'DISTRIBUTOR', NULL);
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
CREATE TABLE IF NOT EXISTS fabric_projections (
  lot_id VARCHAR(120) PRIMARY KEY,
  channel_name VARCHAR(120) NOT NULL,
  chaincode_name VARCHAR(120) NOT NULL,
  projection_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_fabric_projection_lot FOREIGN KEY (lot_id) REFERENCES lots(lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fabric_organizations (
  id BIGINT UNSIGNED PRIMARY KEY,
  msp_id VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT fk_fabric_org_legacy FOREIGN KEY (id) REFERENCES organizations(organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS business_organizations (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  type ENUM('FARM','PROCESSING_FACILITY','LOGISTICS_COMPANY','DISTRIBUTION_COMPANY') NOT NULL,
  fabric_organization_id BIGINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  address VARCHAR(500) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_business_fabric FOREIGN KEY (fabric_organization_id) REFERENCES fabric_organizations(id),
  INDEX idx_business_fabric_status (fabric_organization_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS application_user_profiles (
  user_id CHAR(36) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  business_organization_id CHAR(36) NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(40) NULL,
  region_code VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profile_account FOREIGN KEY (username) REFERENCES user_accounts(username),
  CONSTRAINT fk_profile_business FOREIGN KEY (business_organization_id) REFERENCES business_organizations(id),
  INDEX idx_profile_business (business_organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS user_actor_mappings (
  user_id CHAR(36) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, actor_id),
  CONSTRAINT fk_actor_mapping_user FOREIGN KEY (user_id) REFERENCES application_user_profiles(user_id),
  CONSTRAINT fk_actor_mapping_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS roles (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS permissions (
  code VARCHAR(60) PRIMARY KEY,
  description VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS role_permissions (
  role_code VARCHAR(40) NOT NULL,
  permission_code VARCHAR(60) NOT NULL,
  PRIMARY KEY(role_code,permission_code),
  CONSTRAINT fk_rp_role FOREIGN KEY(role_code) REFERENCES roles(code),
  CONSTRAINT fk_rp_permission FOREIGN KEY(permission_code) REFERENCES permissions(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS fabric_identities (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  msp_id VARCHAR(80) NOT NULL,
  business_organization_id CHAR(36) NOT NULL,
  role_code VARCHAR(40) NOT NULL,
  enrollment_id VARCHAR(120) NOT NULL UNIQUE,
  certificate_reference VARCHAR(500) NOT NULL,
  private_key_reference VARCHAR(500) NOT NULL,
  certificate_sha256 CHAR(64) NOT NULL UNIQUE,
  status ENUM('ACTIVE','DISABLED','REVOKED') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_identity_user FOREIGN KEY(user_id) REFERENCES application_user_profiles(user_id),
  CONSTRAINT fk_identity_business FOREIGN KEY(business_organization_id) REFERENCES business_organizations(id),
  CONSTRAINT fk_identity_role FOREIGN KEY(role_code) REFERENCES roles(code),
  CONSTRAINT fk_identity_msp FOREIGN KEY(msp_id) REFERENCES fabric_organizations(msp_id),
  INDEX idx_identity_user_status (user_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS lot_business_scopes (
  lot_id VARCHAR(120) PRIMARY KEY,
  owner_organization_id CHAR(36) NOT NULL,
  processor_organization_id CHAR(36) NOT NULL,
  distributor_organization_id CHAR(36) NOT NULL,
  current_holder_organization_id CHAR(36) NOT NULL,
  pending_to_organization_id CHAR(36) NULL,
  CONSTRAINT fk_scope_lot FOREIGN KEY(lot_id) REFERENCES lots(lot_id),
  CONSTRAINT fk_scope_owner FOREIGN KEY(owner_organization_id) REFERENCES business_organizations(id),
  CONSTRAINT fk_scope_processor FOREIGN KEY(processor_organization_id) REFERENCES business_organizations(id),
  CONSTRAINT fk_scope_distributor FOREIGN KEY(distributor_organization_id) REFERENCES business_organizations(id),
  CONSTRAINT fk_scope_holder FOREIGN KEY(current_holder_organization_id) REFERENCES business_organizations(id),
  CONSTRAINT fk_scope_pending FOREIGN KEY(pending_to_organization_id) REFERENCES business_organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS identity_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  actor_organization_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(40) NOT NULL,
  resource_id VARCHAR(255) NULL,
  result VARCHAR(40) NOT NULL,
  details JSON NOT NULL,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ia_user FOREIGN KEY(actor_user_id) REFERENCES application_user_profiles(user_id),
  CONSTRAINT fk_ia_org FOREIGN KEY(actor_organization_id) REFERENCES business_organizations(id),
  INDEX idx_ia_actor_time(actor_user_id,timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO fabric_organizations(id,msp_id,name,status)
SELECT organization_id,msp_id,name,status FROM organizations
ON DUPLICATE KEY UPDATE id=fabric_organizations.id;

INSERT INTO business_organizations(id,code,name,type,fabric_organization_id,status)
SELECT UUID(),CONCAT('LEGACY-',LEFT(SHA2(CONCAT(a.actor_id,':',ar.role_code),256),32)),a.full_name,
 CASE ar.role_code WHEN 'FARMER' THEN 'FARM' WHEN 'PROCESSOR' THEN 'PROCESSING_FACILITY' WHEN 'TRANSPORTER' THEN 'LOGISTICS_COMPANY' ELSE 'DISTRIBUTION_COMPANY' END,
 a.organization_id,a.status FROM actors a JOIN actor_roles ar ON ar.actor_id=a.actor_id
WHERE ar.role_code IN ('FARMER','PROCESSOR','TRANSPORTER','DISTRIBUTOR')
ON DUPLICATE KEY UPDATE id=business_organizations.id;

INSERT INTO application_user_profiles(user_id,username,business_organization_id,full_name,email,phone,region_code)
SELECT UUID(),u.username,b.id,COALESCE(a.full_name,u.username),a.email,a.phone,COALESCE(a.region_code,'GLOBAL')
FROM user_accounts u LEFT JOIN actors a ON a.actor_id=u.actor_id
LEFT JOIN business_organizations b ON b.code=CONCAT('LEGACY-',LEFT(SHA2(CONCAT(u.actor_id,':',u.role_code),256),32))
ON DUPLICATE KEY UPDATE user_id=application_user_profiles.user_id;

INSERT INTO user_actor_mappings(user_id,actor_id)
SELECT p.user_id,u.actor_id FROM application_user_profiles p
JOIN user_accounts u ON u.username=p.username WHERE u.actor_id IS NOT NULL
ON DUPLICATE KEY UPDATE user_id=user_actor_mappings.user_id;

INSERT INTO roles(code,name) VALUES ('SUPER_ADMIN','SUPER_ADMIN') ON DUPLICATE KEY UPDATE code=roles.code;
INSERT INTO roles(code,name) VALUES ('FARMER','FARMER') ON DUPLICATE KEY UPDATE code=roles.code;
INSERT INTO roles(code,name) VALUES ('PROCESSOR','PROCESSOR') ON DUPLICATE KEY UPDATE code=roles.code;
INSERT INTO roles(code,name) VALUES ('TRANSPORTER','TRANSPORTER') ON DUPLICATE KEY UPDATE code=roles.code;
INSERT INTO roles(code,name) VALUES ('DISTRIBUTOR','DISTRIBUTOR') ON DUPLICATE KEY UPDATE code=roles.code;
INSERT INTO permissions(code,description) VALUES ('USER_READ','USER_READ') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('USER_CREATE','USER_CREATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('USER_UPDATE','USER_UPDATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('USER_DISABLE','USER_DISABLE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('ORGANIZATION_READ','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('ORGANIZATION_CREATE','ORGANIZATION_CREATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('ORGANIZATION_UPDATE','ORGANIZATION_UPDATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('ORGANIZATION_DISABLE','ORGANIZATION_DISABLE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('BLOCKCHAIN_MONITOR','BLOCKCHAIN_MONITOR') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('AUDIT_LOG_READ','AUDIT_LOG_READ') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_READ','LOT_READ') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('TRACE_HISTORY_READ','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('TRACE_VALIDATE','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_CREATE','LOT_CREATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_HARVEST','LOT_HARVEST') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_RECALL','LOT_RECALL') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_PROCESS','LOT_PROCESS') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('HANDOVER_CREATE','HANDOVER_CREATE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('HANDOVER_CONFIRM','HANDOVER_CONFIRM') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_DISPATCH','LOT_DISPATCH') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO permissions(code,description) VALUES ('LOT_DISPLAY_SALE','LOT_DISPLAY_SALE') ON DUPLICATE KEY UPDATE code=permissions.code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','USER_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','USER_CREATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','USER_UPDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','USER_DISABLE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','ORGANIZATION_CREATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','ORGANIZATION_UPDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','ORGANIZATION_DISABLE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','BLOCKCHAIN_MONITOR') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','AUDIT_LOG_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','LOT_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('SUPER_ADMIN','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','LOT_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','LOT_CREATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','LOT_HARVEST') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('FARMER','LOT_RECALL') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','LOT_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','LOT_PROCESS') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','HANDOVER_CREATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('PROCESSOR','LOT_RECALL') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','LOT_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','HANDOVER_CONFIRM') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('TRANSPORTER','LOT_RECALL') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','ORGANIZATION_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','LOT_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','TRACE_HISTORY_READ') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','TRACE_VALIDATE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','LOT_DISPATCH') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','LOT_DISPLAY_SALE') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
INSERT INTO role_permissions(role_code,permission_code) VALUES ('DISTRIBUTOR','LOT_RECALL') ON DUPLICATE KEY UPDATE role_code=role_permissions.role_code;
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

-- Additive: existing users, roles, actors and ledger projections are retained.
CREATE TABLE IF NOT EXISTS account_invitations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_invitation_user FOREIGN KEY(user_id) REFERENCES application_user_profiles(user_id),
  INDEX idx_invitation_user(user_id,used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS fabric_identity_requests (
  user_id CHAR(36) PRIMARY KEY,
  requested_by CHAR(36) NOT NULL,
  status ENUM('PENDING','APPROVED','ISSUED','DISABLED','FAILED') NOT NULL DEFAULT 'PENDING',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_fir_user FOREIGN KEY(user_id) REFERENCES application_user_profiles(user_id),
  CONSTRAINT fk_fir_actor FOREIGN KEY(requested_by) REFERENCES application_user_profiles(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO roles(code,name) VALUES ('BUSINESS_ADMIN','Quản trị doanh nghiệp');
INSERT IGNORE INTO permissions(code,description) VALUES ('IDENTITY_REQUEST','Yêu cầu cấp danh tính Fabric'),('IDENTITY_DISABLE','Vô hiệu hóa ký phía backend');
INSERT IGNORE INTO role_permissions(role_code,permission_code) VALUES
 ('BUSINESS_ADMIN','USER_READ'),('BUSINESS_ADMIN','USER_CREATE'),('BUSINESS_ADMIN','USER_UPDATE'),('BUSINESS_ADMIN','USER_DISABLE'),
 ('BUSINESS_ADMIN','ORGANIZATION_READ'),('BUSINESS_ADMIN','LOT_READ'),('BUSINESS_ADMIN','TRACE_HISTORY_READ'),('BUSINESS_ADMIN','TRACE_VALIDATE'),
 ('BUSINESS_ADMIN','IDENTITY_REQUEST'),('BUSINESS_ADMIN','IDENTITY_DISABLE'),('SUPER_ADMIN','IDENTITY_DISABLE');
INSERT IGNORE INTO role_permissions(role_code,permission_code)
 SELECT code,'IDENTITY_REQUEST' FROM roles WHERE code IN ('FARMER','PROCESSOR','TRANSPORTER','DISTRIBUTOR');
-- Additive permission: CA material remains backend-only and issuance is tenant-scoped.
ALTER TABLE fabric_identity_requests
  MODIFY status ENUM('PENDING','APPROVED','ISSUED','DISABLED','FAILED') NOT NULL DEFAULT 'PENDING';
INSERT IGNORE INTO permissions(code,description)
VALUES ('IDENTITY_ISSUE','Cấp danh tính Fabric cho yêu cầu hợp lệ');
INSERT IGNORE INTO role_permissions(role_code,permission_code) VALUES
 ('SUPER_ADMIN','IDENTITY_ISSUE'),('BUSINESS_ADMIN','IDENTITY_ISSUE');
