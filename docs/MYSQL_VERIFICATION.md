> **Cập nhật 06/11/2026:** xem [kết quả sửa lỗi và triển khai Fabric v2](./REMEDIATION_RESULTS.md) và [API hiện tại](./API_INTEGRATION.md). Nội dung bên dưới là khảo sát/kết quả của đợt trước; các hạn chế signer/Org3/ABI, rollback RAM, recall lặp và API nhật ký đã được xử lý theo báo cáo mới. 13 hash legacy vẫn được giữ nguyên.

# Báo cáo cập nhật MySQL và kiểm chứng hệ thống

## Kết quả chính

Đã giữ MySQL hiện có, triển khai Backend/Frontend mới và kiểm tra API thật.
Không có PostgreSQL trong lớp lưu trữ đang chạy, nên không có migration từ
PostgreSQL hay thao tác chuyển dữ liệu ledger sang SQL.

- MySQL **8.4.13**, database charset **utf8mb4**, collation utf8mb4_0900_ai_ci.
- Cả **8 bảng đều InnoDB**; transaction/rollback, FK và Unicode đã kiểm chứng.
- Frontend Docker: http://localhost:3001; Backend: http://localhost:8080/api.
- `/api/health`: status ok, mysql enabled, fabric disabled.
- Đã rebuild/recreate riêng Backend và Frontend bằng `--no-deps`.
- Container MySQL và persistent volume không đổi; các container dự án khác
  giữ nguyên. Không chạy seed/reset hoặc ghi nghiệp vụ vào database active.

## Khảo sát schema và dữ liệu thực tế

| Bảng | PK | Quan hệ FK hiện có | Số bản ghi trước/sau |
|---|---|---|---:|
| organizations | organization_id | — | 3 |
| actors | actor_id | organization_id → organizations | 5 |
| actor_roles | actor_id + role_code | actor_id → actors | Giữ nguyên fingerprint |
| user_accounts | username | actor_id → actors; organization_id → organizations | 7 |
| lots | lot_id | — | 3 |
| trace_events | event_id | lot_id → lots | 13 |
| event_documents | document_id | lot_id → lots | 6 |
| audit_log | audit_id | — | 32 |

3 lô gồm 1 READY_FOR_SALE, 1 RECALLED, 1 PROCESSED. Không thêm FK actor_id cho
trace_events: danh tính on-chain x509 không được tự ép thành actor ứng dụng.
Không tự thêm FK event_documents.event_id vì cần kiểm tra dữ liệu legacy trước.

Không dùng ORM/migration framework: `storage.js` dùng mysql2/promise, prepared
statements và connection pool; `schema.sql` là schema khởi tạo database mới.

## Những tệp thay đổi trong lượt MySQL

| Nhóm | Tệp | Thay đổi |
|---|---|---|
| Lưu trữ | backend/storage.js | Credentials từ env, utf8mb4/UTC, DATE dạng chuỗi ngày, DATETIME(3) giữ millisecond, bỏ startup DDL/backfill/re-hash, đọc lịch sử theo thời gian, không sửa hash đã lưu, lỗi INSERT gây rollback |
| Schema | backend/schema.sql | Ghi rõ InnoDB/utf8mb4 cho database mới, giữ PK/FK và kiểu dữ liệu hiện hữu |
| Secrets | .env.example, backend/.env.example | Không có mật khẩu mặc định; .env thực tế bị Git bỏ qua, giữ credential đang dùng |
| Docker | docker-compose.yml | Tham chiếu biến môi trường cho user/password; healthcheck dùng env, giữ service/port/volume/network; API host mysql bên trong Docker |
| Image | backend/Dockerfile, backend/.dockerignore | npm ci, loại .env/node_modules/uploads khỏi build context |
| Seed | backend/seed-demo.js | Chỉ chạy khi được gọi rõ ràng; admin/demo password từ env, không có fallback password |
| Backup | scripts/backup-mysql.sh, .gitignore | Dump nhất quán, file riêng, SHA-256, quyền riêng tư, bỏ backups khỏi Git |
| Test | scripts/test-mysql.js, backend/mysql.integration.test.js | MySQL thật trong DB/user tạm riêng, tự dọn; không sửa DB active |
| Kiểm tra đọc | backend/check-api.js | Assert API đang chạy, chỉ login/GET/logout; không in token/mật khẩu |
| Tài liệu | README.md, frontend/README.md, docs/* | Cập nhật MySQL, quy trình chạy, giới hạn và bằng chứng kiểm thử |

## Bảo toàn dữ liệu và migration

**Migration đã thực hiện: không có.** Schema active vốn đã đáp ứng MySQL 8,
InnoDB, utf8mb4 và có đủ cột hiện tại. Chỉ schema khởi tạo cho database mới được
làm rõ; không apply lại schema/seed vào dữ liệu đang dùng.

Trước cập nhật đã tạo dump ở `backups/mysql-20261105T155214Z.sql` và checksum
`.sha256`, quyền file 600 trong thư mục riêng. Cấu hình mật khẩu đang dùng được
lưu lại vào `.env` quyền 600, không in hoặc commit. Backup chứa dữ liệu riêng tư,
không đưa vào Git hay chia sẻ như tài liệu công khai.

Đã tính fingerprint dữ liệu từng bảng từ dump có thứ tự PK trước/sau cập nhật;
**cả 8 fingerprint giống hệt**. Các bằng chứng riêng ở:

- `backups/before-update-fingerprints.json`
- `backups/after-update-fingerprints.json`
- `backups/deployment-before.json` — image/tag rollback và container/volume MySQL.

Điều này kiểm tra bảo toàn toàn bộ hàng, bao gồm LotID, EventID, liên kết trước,
dataHash, integrityHash, tài khoản và metadata, không chỉ số lượng bản ghi.

Để sao lưu thêm, chạy từ root:

```bash
./scripts/backup-mysql.sh
```

Script dùng mysqldump single-transaction cho InnoDB, không khóa ghi toàn database.
Mỗi lần tạo tên file riêng, không ghi đè backup cũ; kiểm file không rỗng và SHA-256.

### Phương án rollback an toàn

Không có schema/data migration để reverse trong lượt này. Nếu cần khôi phục:

1. Ngừng ghi nghiệp vụ, tạo backup mới của trạng thái hiện tại.
2. Kiểm tra checksum backup và giữ bản trước/sau cùng các file uploads liên quan.
3. Restore dump vào **database mới riêng**, không import đè database đang dùng;
   kiểm FK, số hàng, fingerprint và liên kết/hash trước khi chọn dùng.
4. Chạy thử phiên bản ứng dụng cần khôi phục với database riêng đó, rồi mới
   lên lịch chuyển cấu hình có kiểm soát. Không xóa volume cũ hay data mới phát sinh.
5. Các tag image cũ đã lưu để phục hồi/đối chiếu. **Không tự chạy image Backend
   cũ lên DB active:** phiên bản cũ có startup tự normalize hash. Bản rollback
   được chọn phải giữ phần connect không sửa lịch sử của bản cập nhật này.

Nếu sau này có đổi schema thật, phải tạo migration riêng sau khảo sát/backup và
kiểm thử trên bản restore, không đưa ALTER/data rewrite trở lại startup.

## Kiểm thử trên MySQL thật

Chạy `node scripts/test-mysql.js` từ root. Script tạo DB và tài khoản có tên
ngẫu nhiên riêng, cấp quyền chỉ vào DB đó, chạy schema và test rồi xóa riêng
DB/user vừa tạo. Không nhận tên database active để ghi/xóa từ env hoặc tham số.

**2/2 ca tích hợp đạt**, bao phủ:

- Bootstrap Admin chỉ khi database có 0 tài khoản; login, /me và RBAC.
- Users, organizations, actors, lots; tạo/thu hoạch/sơ chế/bàn giao hai bước/
  vận chuyển/xuất điểm bán/lên kệ/thu hồi theo đúng role/FSM.
- Upload/download chứng từ thật; file hash khớp hash sự kiện; QR PNG/public trace.
- Reset RAM test rồi phục hồi lô từ SQL; restart storage không đổi hash/ID.
- UTC, millisecond, DATE đúng ngày và Unicode emoji trong utf8mb4.
- FK chặn actor không tồn tại; input SQL injection không làm thay đổi truy vấn.
- Transaction saveActor lỗi role trùng phải rollback toàn bộ chỉnh sửa.
- Transaction saveLot lỗi cột bắt buộc phải rollback cả lô và sự kiện.
- Thay dataHash của sự kiện đã lưu bị chặn; bản gốc giữ nguyên.

Test đã phát hiện `INSERT IGNORE` che lỗi NOT NULL; đã thay bằng INSERT chuẩn
cho sự kiện mới, chỉ bỏ qua sự kiện cũ khi hash không thay đổi. Không thêm
cách bỏ qua constraint hoặc tự thay dữ liệu để test đạt.

`bash scripts/test.sh` đạt 33 ca mặc định + typecheck/build. Hai ca MySQL skip
trong lệnh mặc định để không vô tình ghi DB active, và đã chạy riêng thành công.
Tổng **35 ca riêng biệt đã thực thi đạt** qua hai lượt.

## API đang chạy và Frontend

`node backend/check-api.js` dùng tài khoản Admin hiện có từ .env và chỉ thực
hiện login/read/logout. Đã kiểm 25 GET thành công: health, /auth/me, users,
actors, organizations, lots, audit-log và với từng lô: detail/history/validate/
verify-documents/public trace/QR. Dữ liệu trả đúng contract của Frontend. Cả 6 chứng từ hiện có đối soát fileHash
với hash sự kiện thành công (0 chứng từ sai lệch); điều này riêng biệt với
integrityHash lịch sử legacy được mô tả bên dưới.

Thao tác ghi theo các role được test trên MySQL riêng ở trên; không reset mật
khẩu hoặc thử ghi lên ba lô hiện có. Kiểm thử frontend 23 ca vẫn đạt.

Browser đã truy cập /trace/LOT-DEMO-001 tại cổng 3001 qua API/MySQL thật: hiển thị
sản phẩm, 7 sự kiện, nguồn LOCAL và cảnh báo hash. Không dùng mock. Không tràn
ngang ở 1440, 768 và 390 px. Các dashboard theo role, RBAC, form handover, trạng
thái và các trang Admin tiếp tục dùng source Frontend đã triển khai trước đó.

## Vấn đề lịch sử được giữ nguyên để đối soát

13/13 `integrity_hash` hiện có khớp **cách tính legacy với timestamp thành `{}`**,
0/13 khớp cách kiểm tra timestamp ISO đầy đủ. Nguyên nhân đã đối chiếu với source
cũ: normalizeEventHashes lấy DATETIME dưới dạng JavaScript Date, trong khi
sortedValue biến Date không có enumerable keys thành `{}`. Các liên kết
previousEventId của ba lô vẫn khớp, nhưng hash legacy không ràng buộc thời gian.

Bản mới chuẩn hóa timestamp SQL thành ISO trước khi đối soát và giữ millisecond
khi ghi; dữ liệu mới trong test khớp trước/sau lưu/restart. Dữ liệu legacy và
hash gốc **không bị viết lại**, nên giao diện báo lịch sử cần đối soát. Không
coi đó là bằng chứng chắc chắn có người sửa dữ liệu; cũng không coi legacy
hash là xác minh toàn vẹn đầy đủ.

Chưa thực hiện migration hash. Muốn xử lý cần đối chiếu nguồn tin cậy/ledger
(nếu các event đó thực sự có on-chain), giữ nguyên giá trị cũ và lưu kết quả
đối soát có audit; không cập nhật hash cho khớp mà mất bằng chứng gốc.

## Fabric và phần còn thiếu

Fabric hiện **disabled**, không có container Peer/Orderer/CA của hệ thống này
trong danh sách đang chạy. Gateway source được giữ nguyên, chưa kiểm chứng
endorsement/commit/query trên mạng Fabric thật. Blockchain của dự án bỏ phiếu
khác không được đụng tới.

MySQL hiện lưu dữ liệu local/off-chain, không được gọi là lịch sử đã commit
Fabric. Cần signer theo tác nhân/MSP/role và triển khai mạng Fabric trước khi
đối soát on-chain/off-chain thực tế. Chưa đổi dữ liệu on-chain, chaincode hoặc MSP.

Nhật ký canh tác/vận chuyển, quality, incident, hủy/từ chối bàn giao, RBAC động,
metrics TPS/latency và IESH đủ bốn nhóm vẫn cần Backend bổ sung theo
[API_INTEGRATION](./API_INTEGRATION.md). Chưa kiểm QR camera/in giấy hoặc hành vi
đồng thời nhiều backend instance; MySQL và Fabric chưa có commit nguyên tử.
