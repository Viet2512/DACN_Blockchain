# Kết quả sửa lỗi và bổ sung chức năng — 06/11/2026

## Trạng thái triển khai

- Frontend: http://localhost:3001; Backend: http://localhost:8080.
- `GET /api/health/dependencies`: MySQL hoạt động; Gateway thực sự query chaincode thành công.
- Mạng mới dùng channel `tracechannel-v2`, chaincode `traceability_v2`, version 2.0 sequence 1, ba MSP Org1/Org2/Org3. Bốn actor FARMER/PROCESSOR/TRANSPORTER/DISTRIBUTOR được cấp certificate riêng có role/region/actorId.
- Ba peer sau restart Org3 và test cuối cùng có cùng height **40**, currentBlockHash `KDq5za/GHF007ou/x5fuDjY6fddHRsB45MCUcnkxBoc=`.
- Channel `tracechannel` và chaincode `traceability` cũ giữ nguyên. Kiểm tra sau triển khai: channel cũ vẫn height 6 và block hash `NY+4BHIHOp+zCqjrqqFegHcpygv6swkp2RNOYzvtvBA=`.
- Lô mới được tạo qua API dùng ledger v2. Ba lô cũ vẫn là LOCAL; không đổi UUID thành transaction ID, không import chúng lên ledger để giả lịch sử cũ.
- `.env` cục bộ đã chọn hai Compose file qua COMPOSE_FILE. `docker compose up -d` trên môi trường này giữ cấu hình Fabric. File env không được commit.

## Các lỗi đã sửa

| Vấn đề | Thay đổi và kiểm chứng |
| --- | --- |
| RAM tiến trạng thái trước SQL commit | Server tạo draft từ snapshot SQL; chỉ cập nhật cache sau lưu thành công. Fault injection SQL qua HTTP và retry đã qua. |
| Hai writer ghi đè nhau | SELECT FOR UPDATE + đối chiếu lastEventId trong cùng transaction. Hai writer SQL: đúng một thành công, một 409. Fabric: một VALID, một MVCC_READ_CONFLICT code 11; chỉ lưu nhánh hợp lệ. |
| Gắn chứng từ sau transaction | Gắn trong transaction saveLot; hash phải thuộc chứng từ chưa gắn của cùng lô; kiểm tra trước khi gửi Fabric. |
| Hash/timestamp lịch sử bị đổi khi cập nhật actor | Bỏ cập nhật lot/event cũ trong saveActor. Danh tính/MSP/vùng của actor đã được sử dụng không được sửa âm thầm; phải tạo actor mới. |
| Actor/org/role bị thu hồi vẫn dùng được token | Mỗi request và login kiểm tra lại account, actor, tổ chức, quan hệ tổ chức và actor_roles. Test SQL thực tế đã qua. |
| Thiếu vòng đời phiên | TTL 8 giờ; thu hồi phiên sau đổi mật khẩu; giới hạn 10 lần login sai/15 phút theo IP + username trong một process. |
| Recall lặp | Local và chaincode v2 khóa mọi CTE khi RECALLED, kể cả recall lần hai. Nhật ký sự cố off-chain vẫn cho ghi. |
| GetHistory theo thứ tự txId | Đọc theo chuỗi previousEventId từ lastEventId, giữ các event rời để kiểm tra phát hiện. Không dựa vào thời gian trùng hoặc txId ngẫu nhiên. |
| ValidateTraceHistory báo sai CREATE | Trạng thái ban đầu null khớp FSM; test CREATE và cả chuỗi bảy bước đều valid. |
| IESH thiếu nhóm kiểm tra | v2 kiểm recorded identity/MSP/role/vùng, KDE, FSM, bàn giao, previousEvent, hash và trạng thái cuối/count; các bất biến không thể tắt bằng SetValidationMode(false). |
| Gateway dùng một signer/ABI cũ | Manifest server chọn certificate theo actorId + role, kiểm MSP/vùng; v2 ABI khớp source; Org3 đã onboard. Không gửi private key lên Frontend. |
| Ledger commit nhưng SQL lỗi | API reconcile đọc ledger và lưu projection, không submit lại. Test fault injection sau commit giữ nguyên transaction ID và eventCount. |
| SQL bị sửa khác ledger | Validate đối chiếu các cột SQL với dữ liệu ledger. Test đổi location trong DB QA phát hiện MYSQL_EVENT; ledger không đổi. |
| Bật Fabric làm lô local bị nhận nhầm nguồn | fabric_projections định danh từng lô. Public/detail/history/validate dùng nguồn của lô; lô Fabric luôn đọc ledger, không fallback local nếu mạng lỗi. |
| LotID collation MySQL khác ledger | Dùng LotID canonical đã lưu khi query/validate/ghi ledger. |
| Upload MIME giả/rỗng | Giới hạn 5 MiB; PDF/PNG/JPEG kiểm signature và MIME, không ghi đè file cùng tên; tải qua API có quyền. |
| start-fabric.sh tự reset mạng | Script hiện chỉ resume container đã tồn tại, không gọi network.sh down/restart hoặc xóa volume. |

## Chức năng mới

- Nhật ký canh tác (FARMER), kiểm tra chất lượng (PROCESSOR), vị trí/nhiệt độ/độ ẩm vận chuyển (TRANSPORTER, IN_TRANSIT), sự cố (bốn role nghiệp vụ).
- GET/POST `/api/lots/:id/cultivation-logs`, `quality-checks`, `transport-logs`, `incidents`; GET hỗ trợ page/size, size tối đa 100. Dữ liệu off-chain, append-only qua API, có audit và phạm vi vùng/bên nhận.
- UI hồ sơ nghiệp vụ trong chi tiết lô; Admin chỉ đọc, mỗi role có form phù hợp. Giá trị 0 của nhiệt độ/độ ẩm được giữ đúng.
- `POST /api/auth/change-password` và form trong hồ sơ cá nhân; mật khẩu mới tối thiểu 8 ký tự, yêu cầu mật khẩu hiện tại, thu hồi toàn bộ phiên sau đổi.
- `POST /api/fabric/lots/:id/reconcile`; UI có thao tác đối chiếu/đồng bộ sau lỗi không rõ kết quả. Không cho ghi đè lô LOCAL bằng ledger.
- Admin Blockchain hiển thị readiness query thật, thay vì chỉ cấu hình enabled.

## Schema và bảo toàn dữ liệu

Migration đã chạy:

- [002-business-records.sql](../backend/migrations/002-business-records.sql): thêm `lot_records` (record_id PK, lot_id FK, loại, thời điểm, JSON, người ghi), index theo lot/type/time.
- [003-fabric-projections.sql](../backend/migrations/003-fabric-projections.sql): thêm `fabric_projections` (lot_id PK/FK, channel, chaincode, JSON cache), giữ đầy đủ trường ledger để đối chiếu.

Cả hai dùng CREATE TABLE IF NOT EXISTS, InnoDB, utf8mb4. Không ALTER/DROP/reset tám bảng cũ. Projection là cache off-chain; ledger vẫn là nguồn bằng chứng. DB hiện có 10 bảng.

Trước migration đã tạo dump single-transaction, checksum và archive uploads riêng trong thư mục backups bị gitignore. Fingerprint trước/sau của tám bảng cũ giống nhau: 3 organizations, 5 actors, 5 actor_roles, 7 users, 3 lots, 15 events, 6 documents, 32 audit entries. 15 là số dòng quan sát tại thời điểm backup lần này; không đổi các dòng có sẵn để khớp báo cáo trước.

Đã restore dump vào DB tên ngẫu nhiên riêng và giải nén uploads sang thư mục tạm: đủ fingerprint tám bảng và đúng hash cả sáu file. Chỉ DB/user/thư mục QA tự tạo được dọn; không xóa dữ liệu hoạt động hay volume.

## Kiểm thử có bằng chứng

| Nhóm | Kết quả |
| --- | --- |
| Backend mặc định | 12 PASS; 8 test tích hợp được skip khi chưa cấu hình DB QA |
| Chaincode | 3 PASS, TypeScript build qua |
| Frontend | 25 PASS, TypeScript + production build qua |
| MySQL riêng | 4 PASS, gồm API/FSM/docs/constraints/rollback/concurrency/revocation/records/password |
| Fabric thật + MySQL riêng | 3 PASS, gồm per-actor signing/bảy bước/recall, SQL lỗi sau commit/reconcile, MVCC và tamper |
| Restore backup riêng | 1 PASS |
| Tổng test riêng biệt đã chạy | 48 PASS; không đồng nghĩa 101 kịch bản thủ công đều PASS |
| Docker đang hoạt động | 25 GET + login/logout qua; readiness Fabric query thành công; sáu chứng từ khớp |
| Browser thật | Public LOCAL nhận diện đúng dù Backend bật Fabric; không tràn ở 1440/768/390 px |

Test Fabric tạo lot có prefix QA-FAB trên channel v2. Giao dịch này thực sự commit và giữ trên ledger; DB QA đã dọn. Chúng không được đưa vào database ứng dụng để giả lịch sử sản xuất. Các bài test tích hợp được gate bằng tên DB ngẫu nhiên `tracechain_test_<12 hex>`; tuyệt đối không thay bằng DB hoạt động.

CSV hiện có 37 PASS, 28 PARTIAL, 33 NOT_RUN, 2 GAP và 1 KNOWN_ISSUE. Không còn hàng FAIL_FIXTURE hoặc BLOCKED vì cấu hình Fabric; các ca chưa đủ bằng chứng vẫn giữ PARTIAL/NOT_RUN.

Các lệnh tái chạy:

```bash
bash scripts/test.sh
node scripts/test-mysql.js
node scripts/test-mysql.js --fabric
node backend/check-api.js
curl http://localhost:8080/api/health/dependencies
```

## File chính đã sửa/bổ sung

- Backend: [server.js](../backend/server.js), [domain.js](../backend/domain.js), [storage.js](../backend/storage.js), [auth.js](../backend/auth.js), [integrity.js](../backend/integrity.js), [fabric.js](../backend/fabric.js), [records.js](../backend/records.js), [schema.sql](../backend/schema.sql), migrations và tests.
- Chaincode: [traceability.ts](../chaincode/src/traceability.ts), [traceability.test.js](../chaincode/test/traceability.test.js).
- Frontend: LotDetail/LotRecords/Profile/AdminPages/CreateLot, API client/types/Common, các test tương ứng.
- Docker và vận hành: [docker-compose.fabric.yml](../docker-compose.fabric.yml), [start-fabric.sh](../scripts/start-fabric.sh), [enroll-fabric-actors.js](../scripts/enroll-fabric-actors.js), [test-mysql.js](../scripts/test-mysql.js), [check-preserved-data.js](../scripts/check-preserved-data.js).

## Giới hạn còn giữ rõ

1. 13 integrityHash legacy chưa khớp canonical timestamp. Không sửa hash để chuyển thành PASS. Ba lô cũ vẫn LOCAL và có cảnh báo. Một actor legacy GLOBAL chưa được cấp certificate; bốn actor có vùng cụ thể đã được cấp.
2. Chưa chạy đủ 101 ca thủ công; bảng CSV giữ NOT_RUN/PARTIAL khi chưa đủ bằng chứng. Safari/Firefox/điện thoại thật, in/quét QR và tải lớn chưa được nghiệm thu.
3. Hủy/từ chối bàn giao và chỉ định cá nhân chưa có quy tắc FSM trong đặc tả/source gốc. Hợp đồng hiện tại chỉ định **MSP + vùng**, người cùng phạm vi có thể nhận. Không tự thêm CTE mới để thay đổi nghiệp vụ.
4. RBAC động, refresh token, quản trị thêm/xóa MSP từ UI, đo Fabric TPS/Rdetect và phân trang server toàn bộ lô/sự kiện chưa triển khai. Master Prompt quy định các mục này phụ thuộc Backend/quy trình/dữ liệu đo. Nhật ký mới đã phân trang server; danh sách lô hiện giữ contract Lot[] tương thích.
5. Session/rate limit còn ở RAM: restart Backend phải login lại; nhiều replica cần session/rate-limit store chung trước khi triển khai production. CAS lưu lô và MVCC đã có kiểm tra riêng.
6. Mạng đang là Fabric test-network, dùng CA/crypto mẫu và dịch vụ local; không xem là cấu hình production. IESH kiểm metadata đã ghi và hash, không chứng minh dữ liệu đầu vào vật lý là đúng.
7. Không đổi nguyên tắc quản trị Blockchain từ ứng dụng: Admin không được ký CTE thay actor. Khi bổ sung actor/vùng mới cần onboarding certificate thật qua quy trình CA và tạo lại runtime bundle, rồi restart riêng Backend để nạp signer mới.

## Rollback ứng dụng

Image trước cập nhật được giữ dưới `tracechain-backend:before-fabric-v2` và `tracechain-frontend:before-fabric-v2`. Nếu cần rollback, tắt FABRIC cho Backend cũ và kiểm tra ảnh cũ trước khi dùng; không xóa channel/volume, không import đè DB, không drop hai bảng mới. Các lô đã ghi bằng v2 chỉ được xử lý bởi Backend tương thích v2. Khôi phục backup phải vào DB khác trước khi quyết định cutover.
