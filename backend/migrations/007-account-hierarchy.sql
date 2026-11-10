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
  status ENUM('PENDING','ISSUED','DISABLED') NOT NULL DEFAULT 'PENDING',
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
