-- Additive permission: CA material remains backend-only and issuance is tenant-scoped.
ALTER TABLE fabric_identity_requests
  MODIFY status ENUM('PENDING','APPROVED','ISSUED','DISABLED','FAILED') NOT NULL DEFAULT 'PENDING';
INSERT IGNORE INTO permissions(code,description)
VALUES ('IDENTITY_ISSUE','Cấp danh tính Fabric cho yêu cầu hợp lệ');
INSERT IGNORE INTO role_permissions(role_code,permission_code) VALUES
 ('SUPER_ADMIN','IDENTITY_ISSUE'),('BUSINESS_ADMIN','IDENTITY_ISSUE');
