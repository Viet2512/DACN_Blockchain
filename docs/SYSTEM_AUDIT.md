# TraceChain — audit và chuẩn bị demo

Lượt thực thi bắt đầu 10/11/2026. Chỉ kết quả chạy trong lượt này mới tính PASS; báo cáo cũ không thay thế kiểm thử hiện tại.

## Phạm vi thay đổi

- Seed/demo runner, fixture và kiểm thử: tái sử dụng API, RBAC, cấp identity và workflow hiện có; không chèn lô/sự kiện trực tiếp vào SQL.
- Cấu hình npm/Compose và hướng dẫn demo khi runner cần chúng.
- Sửa lỗi ứng dụng chỉ khi có bằng chứng và kiểm thử hồi quy.
- Giữ nguyên tài khoản, mật khẩu, lô, ledger, volume và thay đổi Git đã có trước lượt này.

## Tiến độ

- [x] Đọc AGENTS và Git status: working tree có nhiều thay đổi từ trước; không stage/commit/push.
- [x] Runtime read-only: Docker 29.8.2; MySQL/backend/frontend healthy; Fabric schema 4, tracechannel-v2/traceability_v2, 3 peer.
- [x] Xác định backend NODE_ENV=development, MySQL traceability, Fabric bật; dữ liệu cũ gồm cả LOCAL và FABRIC, phải giữ nguyên.
- [x] Audit routes, auth/RBAC, SQL storage/migrations, Gateway/CA, workflow/chaincode, các trang/biểu mẫu frontend và cấu hình khởi chạy.
- [x] Baseline và regression: backend 26 PASS/32 SKIP; chaincode 10 PASS; frontend 62 PASS, typecheck/build PASS; MySQL QA 8 PASS; accounts/Fabric 7 PASS; delivery 4 PASS; identity/Fabric 5 PASS/1 SKIP.
- [x] Dataset riêng: 4 doanh nghiệp, 13 tài khoản mới, 10 loại sản phẩm trong schema lô, 24 lô; retry tạo thêm 0 account/lot/event.
- [x] 8 signer được CA operator cấp qua request/approval; 140 transaction demo có QSCC validationCode=0, 24/24 IESH/SQL hợp lệ ở snapshot trước browser.
- [x] API/RBAC/IESH: 7 ca từ chối trên dataset và ca từ chối trực tiếp chaincode, ledger không đổi.
- [x] Browser thực tế: 13 form login, 94 lượt trang/role thuộc 19 routes, 1440/390 px, sidebar/URL trái quyền/logout/public; không page error hoặc console error trong lượt PASS. Request/confirm lô 007 dùng native click và API/Fabric thật.
- [x] Restart MySQL, peer Org3, backend/frontend: fingerprint toàn bộ 24 bảng giữ nguyên, lịch sử ledger giữ nguyên; sau restart login/verify/test lại 24 lô PASS. Không xóa volume/ledger.
- [x] Hoàn thiện DEMO_GUIDE và các lệnh demo:check/seed/verify/test.

## Phát hiện ban đầu

- Seed cũ chỉ có 7 lô, 6 staff, chưa có 4 Business Admin; mã lô trùng với dataset LOCAL lịch sử.
- Seed cũ bỏ qua toàn bộ lô đã tồn tại, không thể bổ sung phần còn thiếu sau gián đoạn.
- Tài liệu cũ có mật khẩu demo plaintext; cần bỏ khỏi tài liệu public, không đổi mật khẩu người dùng.

Các hạng mục chưa có bằng chứng hiện tại: **NOT VERIFIED**.

## Lỗi đã sửa và phạm vi

1. **Đối soát thiếu phạm vi doanh nghiệp/projection:** compareLedger chỉ so lot/event SQL; nay còn so lot_business_scopes và projection_json với ledger. Regression sửa các bản ghi này chỉ trong database QA, phát hiện MYSQL_SCOPE/MYSQL_PROJECTION và khôi phục trong finally.
2. **Giám sát commit suy đoán:** API transactions trước đây tự gán COMMITTED_VALID từ event. Nay query peer QSCC và đọc validation code, có ca test cả 11 TxID thực tế; không gán PASS cho request bị từ chối.
3. **Frontend báo cấp signer quá sớm:** API 202 chỉ duyệt/đưa vào hàng đợi nhưng UI báo signer đã active; nay nói rõ chờ CA operator, có frontend regression.
4. **Seed thiếu dữ liệu/resume:** giữ runner lịch sử, thêm runner có namespace riêng, kiểm tra môi trường/credential collision, prefix-resume, phục hồi ledger→SQL và không ghi đè lô đã demo tiếp.
5. **Tài liệu có mật khẩu plaintext:** bỏ giá trị khỏi hướng dẫn cũ, tài liệu mới chỉ tham chiếu biến môi trường; không đổi password của tài khoản cũ.

## Bằng chứng đang có

- [Seed retry](../reports/demo-seed.json): 0 tổ chức/tài khoản/lô/sự kiện mới, 37 mục đã có được giữ. Bổ sung hồ sơ qua API: 23 canh tác, 14 chất lượng, 2 vận chuyển, 1 sự cố; không giả đây là sự kiện on-chain.
- [Demo test](../reports/demo-test.json) và [verify cuối](../reports/demo-verify.json): **13 login, 4 doanh nghiệp, 10 sản phẩm trên lô, 24 lô, 142 sự kiện/142 transaction VALID, 39 yêu cầu bàn giao, 31 xác nhận, 8 bàn giao đang chờ**, 3 lô hoàn tất. Sai quyền/tenant/state/head/KDE bị từ chối, ledger không đổi. Lô 007 hiện RECEIVED_PROCESSOR sau browser; seed không đưa lô về trạng thái cũ.
- [Delivery integration](../reports/delivery-e2e.json): luồng 11 CTE, activation/RBAC/IESH, lỗi SQL sau commit và reconnect; chạy database QA riêng.
- [Runtime read-only](../reports/delivery-runtime-current.json): 3 MSP, chaincode 4.3/sequence 6, peers đồng bộ, endorsement policy và app healthy.
- [Persistence](../reports/delivery-runtime.json): mysqlAllTablesUnchanged=true (24 bảng), ledgerHistoryUnchanged=true, volumesRemoved=false. Snapshot health Docker có thể còn starting ngay sau restart; snapshot read-only cuối và lệnh Compose ps sau đó đều healthy.
- [Browser hiện tại](../reports/demo-browser.json): cả 13 tài khoản PASS; 007 chuyển HARVESTED → WAITING_PROCESSOR → RECEIVED_PROCESSOR bằng đúng người gửi/nhận, thêm hai TxID thật. Click đóng menu mobile vào phần nền hiển thị thực tế, không DOM click/force.
- Đã đọc validate **toàn bộ 35 lô ứng dụng** sau sửa: 28 FABRIC hợp lệ, 7 LOCAL có hash/liên kết hợp lệ. LOCAL không được tuyên bố là Fabric/IESH đầy đủ.
- Backup MySQL trước triển khai app mới ở thư mục backups bị ignore; chỉ recreate backend/frontend, không thay chaincode/channel/schema hay dữ liệu cũ.

## Chức năng chưa có / không mở rộng

Không có Products CRUD độc lập (schema lưu tên sản phẩm trên lô), refresh-token, reject/cancel/timeout bàn giao, email production hay CRL tự động. Không thêm công nghệ/module/trạng thái giả. Benchmark tải lớn, QR camera/in giấy, mạng ngoài, cài máy sạch và restore backup hiện tại: NOT VERIFIED.

Browser kiểm tra đọc/điều hướng cả bốn nhóm staff; thao tác ghi native trong lượt này là bàn giao/tiếp nhận nhà sản xuất–sơ chế. Ghi đủ 11 CTE qua cả bốn vai trò được kiểm thử bằng API/Fabric trong database QA và seed thật; không suy rộng thành mọi nút ghi trên browser đều đã nghiệm thu.

## Nghiệm thu cuối

| Nhóm tiêu chí | Kết quả thực tế |
| --- | --- |
| Docker, MySQL, backend, frontend, Fabric, query chaincode, 3 org | PASS trên môi trường WSL/Docker hiện có |
| 4 doanh nghiệp, System Admin, 4 Business Admin, 8 staff, login | PASS; 13 account mới, 8 certificate staff ACTIVE |
| Sản phẩm, 24 lô, các giai đoạn FSM, lịch sử và bàn giao | PASS theo schema hiện có; không có Products CRUD độc lập |
| 3 lô hoàn tất, lô đang xử lý, 142 TxID/commit | PASS, QSCC validationCode=0 cho từng TxID |
| SQL–Fabric, idempotency, phục hồi commit→SQL | PASS; đối soát toàn dataset, retry 0 event mới, recovery/concurrency regression QA |
| Dashboard, sidebar/RBAC, public trace và QR PNG | PASS trong các bài browser/API đã nêu; camera/in giấy NOT VERIFIED |
| IESH từ chối sai, không sửa ledger để che lỗi | PASS; có ca từ chối trực tiếp chaincode và snapshot lịch sử không đổi |
| Hướng dẫn, scripts, restart/persistence | PASS; DEMO_GUIDE và 4 lệnh demo |
| Lỗi P0/P1 đã phát hiện | Các lỗi nêu trên đã sửa và regression PASS; không khẳng định mọi chức năng không có lỗi |

## API và trang đã kiểm tra

- Auth: login/logout/me, đổi password, invitation/activation/replay/expiry/rate limit; admin và tenant quản lý account/status/role/identity trong MySQL QA riêng.
- Business/fabric organizations, users, permissions, identity request/approve/issue/disable và business activity; từ chối escalation/IDOR/cross-tenant.
- Lots create/list/detail/history/validate, documents/upload/download/verify, QR/public trace, cultivation/quality/transport/incidents, handover request/confirm, recall.
- Transactions/failures/audit/benchmark read, dependencies/proxy, commit QSCC, lỗi SQL sau commit/reconcile và concurrent writer; benchmark tải lớn không được chạy.
- Browser 19 routes: /lots, /handovers, /history, /recalls, /profile, /lots/new, /work, /business/staff, /business/activity, /business/organization, /admin/organizations, /admin/users, /admin/roles, /admin/verification, /admin/blockchain, /admin/fabric-organizations, /admin/fabric-identities, /admin/audit-logs, /admin/reports; thêm dashboard từng role, login/logout, chi tiết 007 và public trace 001.

## File thuộc lượt này

- backend/demo-data.js, backend/demo.js, backend/demo.test.js, backend/package.json.
- backend/storage.js, backend/fabric.js, backend/server.js, backend/delivery.integration.test.js.
- frontend/src/pages/admin/AdminUsersPage.tsx, frontend/src/App.test.tsx.
- scripts/demo.sh, scripts/demo-browser.js.
- DEMO_GUIDE.md, README.md, .env.example, docs/DEMO_TEST_GUIDE.md, tài liệu này và reports/demo-*.json.

Các diff khác đã có trước nhiệm vụ; không nhận là thay đổi của lượt audit này. Không stage/commit/push hoặc thay branch. Khóa/backup/.env vẫn bị ignore.
