# Kết quả triển khai 07/11/2026

## Phần đã hiện thực

- Workflow schema 4, chaincode lifecycle 4.3/sequence 6 trên tracechannel-v2, traceability_v2. Peer thực tế v3.1.5; cả ba tổ chức approve. Channel/ledger cũ không reset.
- Ba chặng bàn giao hai phía: farmer→processor, processor→transporter, transporter→distributor. Chỉ xác nhận của bên nhận mới đổi currentHolder/user/business/region; owner nguồn giữ nguyên.
- Bộ quy tắc dùng chung giữa backend preflight và chaincode tại `chaincode/src/workflow.js`: role/MSP/user/business, FSM, custodian, previousEvent, timestamp, KDE, hash, recall và replay.
- Thêm CTE_HANDOVER_PROCESSOR, CTE_RECEIVE_PROCESSOR, CTE_HANDOVER_RETAIL, CTE_TRANSPORT; CTE_DISPATCH_RETAIL là xác nhận nhận tại phân phối.
- Giao diện request/confirm theo vai trò, khối lượng/đơn vị/quality PASS, sensor zero values, trạng thái mới và lịch sử chỉ đọc với lô cũ. API private kiểm quyền riêng; public dùng allowlist.
- Không cho tạo/cập nhật lô bằng MySQL khi Fabric tắt ngoài DB QA cô lập.
- Chuẩn hóa mã lô v4 ASCII/chữ hoa để tránh va chạm khóa ledger với collation MySQL.
- Chặn documentHash/JSON tùy ý khi tạo lô trước Gateway. Submit chờ commit, projection lưu sau; hydrate/SQL lỗi sau commit có receipt 503 và reconcile không tạo CTE mới; liên kết chứng từ trên mọi sự kiện bị thiếu, kể cả sự kiện không ở cuối lịch sử.
- Migration 006 chỉ thêm local_projections, request_failures và grants. Giữ metadata/hash local v4 qua restart; không đổi hash hay danh tính lịch sử.
- Admin xem trang giao dịch tiếp theo, lỗi yêu cầu và kết quả benchmark; lỗi API có step/code/message. Không lưu body/password vào nhật ký lỗi.
- Frontend Docker phục vụ build tĩnh bằng Vite preview, proxy /api cùng origin; backend/frontend có healthcheck. Đây vẫn là môi trường demo.
- Script seed giữ tài khoản/lô đang có, không ép tắt Fabric. Có init mới với guard không reset và nâng lifecycle theo sequence thực tế.

## Bằng chứng đã chạy

| Kiểm tra | Kết quả thực tế |
| --- | --- |
| Backend unit/HTTP fixture | 18 PASS; full npm test còn skip tích hợp khi không có biến QA |
| Chaincode | 10 PASS, gồm baseline hash nguyên vẹn nhưng sai nghiệp vụ, và benchmark không sửa lô |
| MySQL thật, DB riêng | 7 PASS; rollback, concurrency, restart, docs, user mapping/migration |
| Fabric thật, DB riêng | 6 PASS gồm luồng ba bên, signer/receiver isolation, SQL failure/reconcile, MVCC/tamper và benchmark |
| Frontend | 31 PASS; TypeScript/build qua |
| Bảo toàn | Tám bảng gốc khớp backup trước migration và 5 file chứng từ khớp SHA-256; fingerprint trong reports/data-preservation.json |
| Runtime | MySQL, backend, frontend healthy; /api/health/dependencies trả mysql=true, fabric.ready=true, schemaVersion=4 |

Các giao dịch QA/CA identities là bằng chứng thật còn trên network; DB QA được dọn. Không nhập lô QA vào DB ứng dụng hoặc sửa dữ liệu cũ để đạt PASS. Backend ban đầu restart vì MySQL/Fabric dừng; đã resume container hiện có.

## Đo thực tế

Chi tiết: [JSON](../reports/fabric-benchmark.json), [CSV](../reports/fabric-benchmark.csv).

- Môi trường: Node v24.31.0, Intel i5-1240P, 16 CPU logic, khoảng 8,16 GB RAM, ba MSP.
- Ba lô nghiên cứu tuần tự, 33/33 giao dịch nghiệp vụ commit; latency Gateway trung bình 2045,59 ms, p95 2061,89 ms.
- Query history trung bình 7,71 ms (3 mẫu).
- 18/18 probe sai qua Gateway/chaincode bị từ chối; 9/9 yêu cầu sai qua API bị chặn; 3/3 yêu cầu truy cập trái phép trong mẫu bị chặn.
- Throughput business trong workload hỗn hợp 0,37 giao dịch commit/giây. Thời gian gồm probe sai, query, sáu research writes và lấy thống kê; không phải TPS bão hòa mạng.
- Baseline query hash 10,08 ms; IESH 8,93 ms: chênh lệch quan sát -11,45%.
- Research-key write kèm hash baseline 2052,43 ms; kèm IESH 2047,49 ms: chênh lệch -0,24%. Mẫu nhỏ và batching chi phối; chênh lệch âm không chứng minh IESH nhanh hơn baseline.
- 39 snapshot tài nguyên container trong JSON. Không xem snapshot là peak CPU/RAM của phép thử tải. Máy còn chạy các ứng dụng Docker khác.

Baseline ghi vào composite key research tách khỏi lot/event, chỉ cho farmer của lô QA tương ứng, nonce chống lặp. Không có chế độ tắt IESH cho CTE. So sánh này đo kiểm tra lịch sử kèm cùng loại write, không đo ablation của toàn bộ production CTE.

Lượt benchmark đầu lỗi ECONNRESET do HTTP keepalive qua thời gian chờ dài; đã sửa harness dùng connection riêng và lấy stats bất đồng bộ. Lượt cuối PASS, không retry POST để che lỗi. Healthcheck cũng phát hiện preview tìm nhầm dist thay vì build; đã sửa cấu hình output directory và kiểm lại HTTP.

## Khác biệt phải cập nhật báo cáo

- MySQL thay PostgreSQL; world state mặc định LevelDB, không tự khẳng định CouchDB.
- FSM và danh sách CTE mới có đủ ba chặng bàn giao. Người nhận là doanh nghiệp, không độc quyền tài xế.
- Lô <=3 chỉ đọc. Chỉ nguồn FABRIC mới có bằng chứng ledger, LOCAL không phải blockchain.
- IESH là cơ chế kết hợp được hiện thực/đánh giá trong phạm vi đồ án; chưa chứng minh tính mới khoa học toàn cục.
- Thu hồi là cảnh báo/khóa lô; chưa phải quản lý thu gom thực địa. Hồ sơ bổ sung chưa tự được neo hash lên ledger.

Tổng 72 ca PASS qua các bộ đã chạy. npm test backend mặc định có 18 PASS/20 SKIP; nhóm MySQL/Fabric đã chạy riêng bằng QA runner. Test restore legacy dùng snapshot cũ vẫn SKIP; thay bằng verifier restore backup của lượt này và kiểm 5 file thực tế. Browser đã mở public trace và chi tiết legacy, kiểm 390/768/1440 px không tràn ngang. Chưa chạy browser E2E toàn bộ vai trò.

Bằng chứng runtime cuối: [fabric-runtime.json](../reports/fabric-runtime.json). Ba peer cùng height 314 và currentBlockHash; definition 4.3/sequence 6 trên cả ba. Channel cũ hiện height 6.

## Phần còn lại

- P2: cancel/reject/timeout bàn giao, CRL tự động và session/rate-limit store chung nếu vận hành nhiều replica.
- P2: máy sạch hoàn toàn, Firefox/Safari, quét/in QR bằng thiết bị vật lý chưa nghiệm thu.
- P3: benchmark tải đồng thời/lặp nhiều lần, fault injection container/network và phân tích thống kê sâu hơn.
- Không bổ sung ERP/WMS, thanh toán/token, Kubernetes, native mobile hay IoT phần cứng.

Xem [hướng dẫn khởi chạy và demo](./WORKFLOW_V4.md). Không commit/push, không đổi nhánh hoặc cơ chế loại trừ AGENTS.md.

## Module thay đổi trong lượt này

| Nhóm | File chính |
| --- | --- |
| Quy tắc và ledger | [workflow.js](../chaincode/src/workflow.js), [traceability.ts](../chaincode/src/traceability.ts), [tsconfig](../chaincode/tsconfig.json), [tests](../chaincode/test/traceability.test.js) |
| API và lưu trữ | [server](../backend/server.js), [domain](../backend/domain.js), [authorization](../backend/authorization.js), [storage](../backend/storage.js), [fabric](../backend/fabric.js), [hash](../backend/hash.js), [integrity](../backend/integrity.js), [schema](../backend/schema.sql), [migration 006](../backend/migrations/006-custody-workflow.sql) |
| Frontend | [permissions](../frontend/src/utils/permissions.ts), [types](../frontend/src/types.ts), [API client](../frontend/src/services/api.ts), [event form](../frontend/src/pages/events/EventFormModal.tsx), [detail](../frontend/src/pages/lots/LotDetailPage.tsx), [create](../frontend/src/pages/lots/CreateLotPage.tsx), [lists](../frontend/src/pages/lots/LotsPage.tsx), [dashboard](../frontend/src/pages/dashboard/DashboardPage.tsx), [admin](../frontend/src/pages/admin/AdminPages.tsx), [timeline](../frontend/src/pages/shared/HistoryPage.tsx), [public](../frontend/src/pages/public/TracePublicPage.tsx), [common](../frontend/src/components/Common.tsx) |
| Vận hành | [Compose](../docker-compose.yml), [Fabric override](../docker-compose.fabric.yml), Dockerfiles/ignore, [Vite config](../frontend/vite.config.ts), [init](../scripts/init-fabric.sh), [resume](../scripts/start-fabric.sh), [upgrade](../scripts/upgrade-business-chaincode.sh), [package](../scripts/package-chaincode-offline.js), [migration runner](../scripts/migrate-workflow.js), seed/up/test scripts |
| Bằng chứng | Backend/chaincode/frontend regression tests, [benchmark runner](../scripts/benchmark-fabric.sh), [preservation verifier](../scripts/verify-workflow-preservation.js), báo cáo JSON/CSV và hướng dẫn v4 |

Các thay đổi có sẵn trước lượt triển khai được giữ nguyên; danh sách Git diff toàn repository còn bao gồm công việc trước đó, không phải tất cả đều mới viết trong lượt này.
