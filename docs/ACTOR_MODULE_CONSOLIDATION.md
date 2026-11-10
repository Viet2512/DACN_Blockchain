# Hợp nhất quản trị tác nhân — 06/11/2026

## Kết luận

Trong source hiện tại, actor không có vòng đời nghiệp vụ độc lập. Nó từng gộp tên, liên hệ, role, MSP, vùng và chuỗi X.509; mô hình mới đã có User, Business Organization và Fabric Identity riêng. Giữ actor như lớp tương thích, không duy trì hai form nhập một người.

Fabric Organization → Business Organization → User → Role/Permissions → Fabric Identity.

Audit chỉ đọc trên MySQL đang chạy: 5 actor, 7 account/profile, 6 Fabric Identity, 15 sự kiện; có 2 actor được nhiều account cùng tham chiếu. Khóa ngoại từ user_accounts và actor_roles vẫn trỏ về actors; không được drop bảng hoặc suy ra một User duy nhất từ actorId legacy.

## Dependency đã kiểm tra

| Thành phần | Sử dụng actor | Xử lý |
|---|---|---|
| MySQL `actors`, `actor_roles`, `user_accounts.actor_id` | FK tài khoản, trạng thái và quyền legacy; nhiều account có thể chung actor | Giữ nguyên; user mới tự tạo row tương thích, không nhập actor riêng |
| MySQL `trace_events.actor_id`, `lots.current_holder`, `event_documents.uploaded_by` | Bằng chứng người thực hiện/bên giữ lô, người upload | Không sửa dữ liệu cũ; không tự suy ra người ký từ mapping nhiều tài khoản |
| [storage](../backend/storage.js) | list/saveActor; auth/listUsers join actor/role/MSP; saveUser; projection event | Giữ API/storage legacy, thêm mapping bền vững trước khi account đổi actor; phone thuộc profile riêng |
| [server](../backend/server.js) | GET/POST `/actors`, tạo lô, sự kiện, bàn giao, audit, upload | API actor giữ cho client cũ; ghi CTE đã lấy User ID và doanh nghiệp từ phiên, không từ body |
| [domain](../backend/domain.js), [hash](../backend/hash.js), [integrity](../backend/integrity.js) | actorId nằm trong event và nội dung hash | Không đổi tên trường serialized, không tính lại hash |
| [Chaincode](../chaincode/src/traceability.ts) | actorId/currentHolder, IESH Identity và Handover | Schema mới lấy userId/businessOrg/signerId từ certificate; actorId=userId. Giữ khả năng đọc/validate schema cũ; không nâng lifecycle |
| [Gateway](../backend/fabric.js), [enrollment](../scripts/enroll-fabric-users.js) | Chọn certificate theo mapping User ID; attribute actorId vẫn được cấp như alias | Giữ kiểm khớp User ID, doanh nghiệp, role, MSP và vùng; không dùng legacy X.509 text làm quyền ký |
| [seed](../backend/seed-demo.js), [check-api](../backend/check-api.js), [enroll alias](../scripts/enroll-fabric-actors.js) | Client tác nhân cũ và fixtures | Giữ hoạt động; không chạy seed/reset để cập nhật |
| [migration 004](../backend/migrations/004-identity-organizations.sql), snapshot/check-preserved-data, test fixtures | Actor gốc để backfill và đối chiếu dấu vân tay dữ liệu | Giữ lịch sử; không sửa migration đã dùng |

## Phân bố trường quản trị

| Trường cũ | Nơi quản trị |
|---|---|
| Họ tên, email cá nhân, điện thoại, vùng, role, doanh nghiệp | Người dùng; User ID do Backend cấp |
| Tên đơn vị, mã, loại hình, địa chỉ, email/điện thoại doanh nghiệp, MSP | Doanh nghiệp; danh mục MSP ở Tổ chức Fabric |
| Enrollment, fingerprint, trạng thái certificate và ánh xạ User/doanh nghiệp | Danh tính Fabric, chỉ đọc; cấp/revoke vẫn thuộc người vận hành CA |
| actorId cũ | `user_actor_mappings`, hiển thị đối soát trong Người dùng; có thể tìm theo ID cũ |
| fabricIdentity dạng text cũ, phone trong actor cũ | Giữ nguyên ở actor để tra cứu bằng API legacy; không sao chép thành chứng thư hợp lệ |

`/admin/actors` chuyển hướng có kiểm quyền đến `/admin/users`. Sidebar, form CRUD, service actor và type Actor ở Frontend đã bỏ. Profile và lịch sử ưu tiên User ID/Business Organization; sự kiện cũ vẫn hiển thị rõ Actor legacy. Public timeline tiếp tục ẩn định danh cá nhân.

## Mapping tương thích

[Migration 005](../backend/migrations/005-actor-user-mappings.sql) thêm `user_actor_mappings(user_id,actor_id)` với khóa ngoại, cho phép nhiều user cùng actor cũ. [Runner](../scripts/migrate-actors.js) thêm phone vào profile nếu thiếu, sao chép phone cũ lần đầu và backfill mapping. Lần chạy sau không ghi đè phone đã chỉnh. `saveUser` giữ alias cũ và alias hiện tại trong cùng transaction; không tin userId/actorId do client tự gửi.

Mapping là liên kết tài khoản với ID legacy, không phải chứng minh tài khoản cụ thể đã ký một sự kiện cũ. Actor không còn account liên kết vẫn tồn tại, có thể đọc bằng GET `/api/actors`; không tạo mapping đoán cho actor mồ côi. Không đổi quyền truy cập lô legacy hoặc mở khóa nghiệp vụ chỉ vì có mapping.

## Thứ tự áp dụng trên môi trường đang chạy

Thay đổi lần này chỉ sửa source và chạy test trên database tạm, chưa migrate/deploy database đang dùng. Môi trường phải có migration 004 trước.

1. Sao lưu MySQL bằng `bash scripts/backup-mysql.sh`.
2. Từ thư mục gốc chạy `node scripts/migrate-actors.js` với credentials database hiện có. Không copy đè `.env`, không chạy lại schema/seed/reset.
3. Sau khi migration báo thành công mới deploy Backend/Frontend mới. Không cần thay Chaincode, channel hay certificate.
4. Kiểm tra `/api/health/dependencies` và đăng nhập lại nếu Backend restart.

Rollback ứng dụng không drop cột/bảng mapping; dữ liệu cũ và ứng dụng cũ vẫn đọc được. Không rollback bằng cách import đè database hoặc reset Fabric.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `bash scripts/test.sh` | Backend 14 test qua (integration cần hạ tầng được skip trong lượt này), Chaincode 5 test qua, Frontend 29 test qua; typecheck và production build thành công |
| `node scripts/test-mysql.js` | 6 test qua trên database riêng: lifecycle, auth, FK/rollback, concurrent write, mapping nhiều tài khoản, migration từ schema trước 005; database tạm đã dọn |
| `node scripts/test-mysql.js --identity` | 3 test qua trên MySQL riêng: doanh nghiệp cùng MSP, nhiều người cùng doanh nghiệp, quyền và bàn giao/IESH; 2 test ghi Fabric được skip |
| Readiness của deployment hiện tại (chỉ đọc) | mysql=true, fabric.ready=true, schemaVersion=3 |
| `git diff --check` | Không có lỗi whitespace |

Không chạy ghi giao dịch trên ledger đang dùng, không cấp/revoke certificate, không deploy source mới. Test Chaincode dùng stub in-memory; readiness deployment cũ không thay thế kiểm thử deployment mới.

## Files thay đổi

- Frontend: [App](../frontend/src/App.tsx), [sidebar](../frontend/src/components/DashboardLayout.tsx), [AdminPages](../frontend/src/pages/admin/AdminPages.tsx), [Người dùng](../frontend/src/pages/admin/AdminUsersPage.tsx), [Danh tính Fabric](../frontend/src/pages/admin/IdentityAdminPages.tsx), [profile](../frontend/src/pages/shared/ProfilePage.tsx), [lịch sử](../frontend/src/pages/shared/HistoryPage.tsx), [timeline](../frontend/src/components/Common.tsx), [API service](../frontend/src/services/api.ts), [types](../frontend/src/types.ts), [test UI](../frontend/src/App.test.tsx).
- Backend/MySQL: [storage](../backend/storage.js), [server](../backend/server.js) (chỉ comment tương thích), [schema](../backend/schema.sql), [migration 005](../backend/migrations/005-actor-user-mappings.sql), [runner](../scripts/migrate-actors.js), [test MySQL](../backend/mysql.integration.test.js), [test runner](../scripts/test-mysql.js).
- Tài liệu: báo cáo này, [kiến trúc](./IDENTITY_ORGANIZATION_ARCHITECTURE.md), [API](./API_INTEGRATION.md), [kế hoạch Frontend](./FRONTEND_IMPLEMENTATION_PLAN.md), [mức hoàn thiện](./FEATURE_COMPLETION.md).
