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
  region_code VARCHAR(80) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profile_account FOREIGN KEY (username) REFERENCES user_accounts(username),
  CONSTRAINT fk_profile_business FOREIGN KEY (business_organization_id) REFERENCES business_organizations(id),
  INDEX idx_profile_business (business_organization_id)
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

INSERT INTO application_user_profiles(user_id,username,business_organization_id,full_name,email,region_code)
SELECT UUID(),u.username,b.id,COALESCE(a.full_name,u.username),a.email,COALESCE(a.region_code,'GLOBAL')
FROM user_accounts u LEFT JOIN actors a ON a.actor_id=u.actor_id
LEFT JOIN business_organizations b ON b.code=CONCAT('LEGACY-',LEFT(SHA2(CONCAT(u.actor_id,':',u.role_code),256),32))
ON DUPLICATE KEY UPDATE user_id=application_user_profiles.user_id;

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
