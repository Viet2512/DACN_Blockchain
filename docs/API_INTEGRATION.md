# Tích hợp API — mô hình B / workflow v4

Frontend dùng Axios, VITE_API_URL (fallback REACT_APP_API_URL), mặc định `/api` cùng origin qua Vite proxy. Điện thoại không gọi localhost của chính nó. Token trong sessionStorage; `/auth/me` quyết định danh tính/quyền. Không lưu private key trong browser. Mutation không tự retry; timeout/5xx khi ghi là chưa rõ kết quả và phải đối chiếu lịch sử.

## Phiên và quản trị

- POST `/auth/login`: username/password → token/user; giới hạn 10 login sai/15 phút theo IP/username mỗi process.
- GET `/auth/me`, POST `/auth/logout` (204).
- Mô hình B: System Admin tạo doanh nghiệp và mời BUSINESS_ADMIN bằng POST `/users/invitations`; quản trị doanh nghiệp chỉ mời nhân viên đúng vai trò/đúng doanh nghiệp. POST `/auth/accept-invitation` kích hoạt lời mời một lần. Token chỉ được trả trong dev/test, không ghi token/mật khẩu vào bằng chứng.
- Cấp chứng thư: POST `/users/:username/fabric-identity/request`, sau đó `/issue` trả 202; CA operator cấp bất đồng bộ. Chỉ trạng thái ACTIVE mới được ký. Quản trị doanh nghiệp không được cấp cho doanh nghiệp khác; không coi PENDING mặc định là đã gửi yêu cầu.
- POST `/auth/change-password`: currentPassword/newPassword (ít nhất 8 ký tự) → 204, thu hồi mọi phiên.
- Phiên RAM TTL 8 giờ, mất khi restart. Mỗi request kiểm account ACTIVE, actor/org ACTIVE, quan hệ tổ chức và actor_roles. Khóa/reset/update user thu hồi phiên cũ.
- GET/POST `/users`, PATCH `/users/:username`, PATCH `/users/:username/status`, POST `/users/:username/reset-password`: Admin. Form nhận username/password, fullName/email/phone, role, business organizationId và regionCode; không nhập actorId hay X.509 ID. User ID do Backend cấp; sửa user không tự mở khóa. Role/doanh nghiệp/vùng thay đổi sẽ vô hiệu hóa mapping certificate cũ.
- User response có `legacyActorIds` (chỉ đối soát, có thể nhiều tài khoản chung một ID cũ) và phone riêng theo profile. Mapping được lưu trước khi đổi liên kết actor. Không gán User ID mới vào sự kiện cũ hoặc tính lại hash.
- GET/POST `/actors`: API tương thích cho client/seed cũ; không còn form/sidebar Admin. Không tự cấp cert. Actor có liên kết user/history không được đổi identity/MSP/vùng âm thầm. Bảng/API vẫn giữ để phục vụ auth legacy và lịch sử.
- GET `/organizations`: danh sách metadata tổ chức hiện tại; không thêm/xóa MSP từ UI.
- GET `/admin/audit-log`: Admin; tối đa 500 dòng. Audit ứng dụng khác ledger.

## Lô và sự kiện

GET `/lots` trả Lot[] (contract cũ giữ nguyên), GET `/lots/:id` trả Lot có events và source `LOCAL|FABRIC`.

POST `/lots` dành FARMER cùng vùng:

```json
{"lotId":"LOT-2026-001","productName":"Xoài","origin":"Tiền Giang","harvestDate":"2026-11-06","location":"Vùng trồng","regionCode":"TG-001","processorOrganizationId":"id-doanh-nghiep-so-che","distributorOrganizationId":"id-doanh-nghiep-phan-phoi"}
```

POST `/lots/:id/events`:

```json
{"eventType":"CTE_HARVEST","location":"Vùng trồng","previousEventId":"id-moi-nhat","data":{"note":"Đã thu hoạch","quantity":100,"unit":"kg"}}
```

ActorId/role/MSP/vùng từ phiên; timestamp server/ledger, không dùng timestamp client. Sai role 403; sai FSM/previousEvent/đã recall 409. LotID giới hạn 120, tên/nguồn/địa điểm 255; ngày kiểm hợp lệ lịch. MySQL collation không phân biệt hoa thường; API dùng LotID canonical khi gọi ledger.

- POST `/lots/:id/handover/request`: FARMER giao sơ chế, PROCESSOR giao vận chuyển, TRANSPORTER giao phân phối. Nhận location,previousEventId,toOrganizationId,toRegion,data; Backend tra MSP của doanh nghiệp nhận, không tin MSP client gửi. Sơ chế/phân phối phải khớp đơn vị đã phân công khi tạo lô.
- POST `/lots/:id/handover/confirm`: PROCESSOR/TRANSPORTER/DISTRIBUTOR tương ứng ba chặng; đúng doanh nghiệp, MSP và vùng được chỉ định. Request giữ nguyên bên giữ lô; confirm hợp lệ mới chuyển. Hai doanh nghiệp cùng MSP vẫn không được xác nhận thay nhau. Lặp request/confirm bị từ chối, không thêm CTE.
- POST `/lots/:id/recall`: actor nghiệp vụ cùng phạm vi; location,previousEventId,data. RECALLED khóa mọi CTE kể cả recall lặp.
- GET `/lots/:id/history`: theo chuỗi previousEventId.
- GET `/lots/:id/validate`: lô v4 dùng scope `IESH_V4`, đối chiếu SQL với ledger. Các lô legacy giữ phạm vi kiểm tra cũ. Xem valid/anomalies; HTTP 200 không đồng nghĩa hợp lệ.
- POST `/fabric/lots/:id/reconcile`: đọc ledger để đồng bộ SQL sau commit lỗi lưu; không submit transaction mới; không ghi đè lô LOCAL hoặc hash cũ. UI có thao tác phục hồi/đối chiếu.

Phạm vi đọc: System Admin hoặc doanh nghiệp liên quan đến lô (chủ, bên được phân công, bên giữ, bên chờ nhận hoặc đã tham gia). Cùng vùng/MSP không tự tạo quyền. Detail/history/documents/validate/ghi dùng cùng middleware. Admin không ký nghiệp vụ. Chỉ cập nhật RAM sau SQL commit; saveLot dùng transaction, khóa hàng và lastEventId để chặn lost update.

## Hồ sơ off-chain mới

GET/POST `/lots/:id/{cultivation-logs|quality-checks|transport-logs|incidents}`.

Mọi POST cần occurredAt ISO hợp lệ, có thể có note; không thay trạng thái Blockchain. Dữ liệu được append với username và audit trong transaction. GET trả `{items,total,page,size}`, page mặc định 1, size 20/tối đa 100.

| Loại | Role ghi | Trường bắt buộc | Bổ sung |
| --- | --- | --- | --- |
| cultivation-logs | FARMER | activity | note |
| quality-checks | PROCESSOR | result: PASS/FAIL/PENDING | note |
| transport-logs | TRANSPORTER, trạng thái IN_TRANSIT | location | temperature số hữu hạn, humidity 0..100 |
| incidents | bốn role nghiệp vụ | type,description | note |

Văn bản tối đa 2000 ký tự/trường. Lô RECALLED chỉ cho thêm incident. Các role có quyền đọc lô xem hồ sơ; Admin chỉ đọc.

## Chứng từ

POST `/documents`: multipart document + lotId; tối đa 5 MiB; PDF/PNG/JPEG kiểm MIME + signature byte, không chấp nhận rỗng. Cần quyền nghiệp vụ và phạm vi lô.

Response `{fileName,fileHash,path}`. Path là tham chiếu nội bộ, không public static. Gửi data.documentHash trong CTE; phải là chứng từ chưa gắn thuộc cùng lô. Gắn chứng từ nằm trong transaction lưu sự kiện.

GET `/lots/:id/verify-documents`: `{valid:boolean|null,documents:[...]}` đối chiếu byte file, fileHash metadata và dataHash sự kiện. Không có chứng từ → null. Với lô Fabric lấy sự kiện thật từ ledger.

GET `/lots/:id/documents/:documentId`: download có Bearer/phạm vi; `/uploads/*` không công khai.

## Public/QR

GET `/public/trace/:id` (alias `/public/lots/:id`): lotId,productName,origin,harvestDate,status,source,notice,events,integrity. Event allowlist không có actorId/data/contact/private path. Lô không có → 404.

Nguồn theo từng lô: lô legacy LOCAL không được nhận nhầm FABRIC dù cấu hình Fabric enabled. Lô Fabric query ledger và kiểm metadata IESH; không fallback SQL khi mạng lỗi. Public không đối chiếu SQL nội bộ; API validate có quyền đối chiếu thêm SQL.

GET `/lots/:id/qr`: PNG trỏ PUBLIC_BASE_URL/trace/:id. Đổi PUBLIC_BASE_URL thành địa chỉ điện thoại truy cập được trước khi in/quét QR thật.

## Fabric và vận hành

GET `/health`: cấu hình enabled/disabled. GET `/health/dependencies`: query MySQL và metadata chaincode thật, trả 503 khi kết nối/ABI sai.

Gateway lấy mapping Fabric Identity từ MySQL theo user/doanh nghiệp/role/MSP/vùng, đọc chứng thư và khóa từ runtime được bảo vệ, đối chiếu fingerprint, thời hạn và certificate attributes. Private key không nằm trong MySQL hoặc browser. submitTransaction đợi commit status; CommitError trả 409 với transactionId/validationCode. Trường hợp chưa rõ commit không retry mù quáng. Readiness không thay thế kiểm thử transaction nghiệp vụ.

Chaincode không ghi MySQL. Sau khi Fabric commit hợp lệ, Backend mới lưu bản chiếu/hồ sơ off-chain bằng transaction MySQL. Không có transaction nguyên tử bao trùm Fabric và SQL: nếu commit xong mà lưu SQL lỗi, dùng receipt và reconcile, không gửi lại CTE. Ledger chứa sự kiện, metadata nghiệp vụ và hash; file chứng từ nằm off-chain.

Lô mới dùng tracechannel-v2/traceability_v2; lô legacy giữ LOCAL. fabric_projections là cache giữ đầy đủ trường ledger; các cột SQL vẫn được đối chiếu với ledger khi validate. Channel cũ không bị nâng cấp/ghi đè. Xem [khởi động Fabric](./FABRIC_STARTUP.md).

13 hash legacy chưa khớp canonical timestamp vẫn được cảnh báo, không rehash để che lỗi. Xem [kết quả sửa lỗi](./REMEDIATION_RESULTS.md).

## Mục phụ thuộc quy tắc hoặc đo đạc, chưa thêm API

- Cancel/reject handover và chỉ định độc quyền cá nhân: cần định nghĩa CTE/FSM và chính sách trách nhiệm trước khi bổ sung.
- RBAC động: cần nhất quán quyền trên ứng dụng và chaincode; hiện dùng ma trận cố định có kiểm Backend/chaincode.
- Fabric TPS/Rdetect: cần tập đo có nhãn và commit latency/window thật; không suy từ số lô hoặc HTTP req/s.
- CRUD thêm/xóa MSP từ UI: cần quy trình quản trị channel/CA; Org3 đã được người vận hành onboarding.
- Refresh token/store phiên dùng chung và phân trang server Lot[]/sự kiện tổng hợp: chưa triển khai; hồ sơ mới đã có phân trang server.

Các mục này không có nút giả hoặc trạng thái commit giả trên UI.
