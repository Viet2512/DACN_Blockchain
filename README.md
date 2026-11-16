# TraceChain — bản demo bảo vệ đồ án

Hệ thống truy xuất nguồn gốc nông sản dùng React/TypeScript, Express, MySQL và Hyperledger Fabric. IESH kiểm tra **Danh tính – Sự kiện – Trạng thái – Bàn giao**; SHA-256 kiểm tra tính toàn vẹn dữ liệu. Hai lớp kiểm tra không chứng minh sự thật vật lý của hàng hóa.

**Luồng hiện hành ngày 14/11/2026:** resume mạng Fabric v4 đang có, dùng nhóm tài khoản `tc_*`, không seed/reset khi khởi động.

## Chạy ngay trên máy đã có dữ liệu

Mở Docker Desktop, đợi Engine chạy, bật WSL integration cho distro hiện tại. Trong terminal Remote WSL:

```bash
cd /home/viet/DoAnBlockchain
bash scripts/up.sh
bash scripts/demo.sh check
curl -fsS http://localhost:8080/api/health/dependencies
```

Mở **http://localhost:3001**. Kết quả dependency health phải có `mysql:true`, `fabric.ready:true`, `schemaVersion:4`, channel `tracechannel-v2`, chaincode `traceability_v2`. Không dùng riêng `/api/health` để kết luận Fabric sẵn sàng.

| Thành phần | Địa chỉ Docker | Ghi chú |
|---|---|---|
| Frontend | http://localhost:3001 | Cổng 3000 bên trong container; browser dùng `/api` cùng origin |
| Backend | http://localhost:8080 | Chỉ publish loopback |
| MySQL 8.4 | 127.0.0.1:3307 | Backend container dùng `mysql:3306` |
| Fabric | Org1MSP, Org2MSP, Org3MSP | Chaincode 4.3, sequence 6; schema nghiệp vụ 4 |

Script resume CA/orderer/peer hiện hữu, đặt `unless-stopped` và đợi ứng dụng healthy. Peer/orderer/CA thuộc project Compose cũ `compose`; Compose ứng dụng thuộc `doanblockchain`. Không tạo lại channel hoặc deploy lại chaincode để startup. Sau backend restart phải đăng nhập lại vì session lưu trong RAM.

## Tài khoản demo đang dùng

Lấy mật khẩu từ `DEMO_PASSWORD` trong cấu hình môi trường gốc riêng hoặc password manager; không đưa giá trị vào chat, ảnh hay báo cáo. Nhóm 17 tài khoản dưới đây đã được kiểm tra đăng nhập. Tám tài khoản cũ đã bị khóa theo yêu cầu; đổi biến môi trường không đổi password của account đã có.

| Vai trò | Tài khoản |
|---|---|
| Quản trị hệ thống | `tc_system` |
| Quản trị sản xuất | `tc_admin_sanxuat` |
| Quản trị sơ chế | `tc_admin_soche` |
| Quản trị vận chuyển | `tc_admin_vanchuyen` |
| Quản trị phân phối | `tc_admin_phanphoi` |
| Nhân viên sản xuất | `tc_nv_sanxuat01`, `tc_nv_sanxuat02`, `tc_nv_sanxuat03` |
| Nhân viên sơ chế | `tc_nv_soche01`, `tc_nv_soche02`, `tc_nv_soche03` |
| Nhân viên vận chuyển | `tc_nv_vanchuyen01`, `tc_nv_vanchuyen02`, `tc_nv_vanchuyen03` |
| Nhân viên phân phối | `tc_nv_phanphoi01`, `tc_nv_phanphoi02`, `tc_nv_phanphoi03` |

**Chốt bảo vệ 17/11:** [Bộ dữ liệu mới và lô có thể thao tác tiếp](docs/LIVE_DEMO_20261117.md): 150 lô/1.405 CTE, thêm bốn nhân viên có signer thật và 25 lô mới. [Kịch bản 3–5 phút và bằng chứng diễn tập trước](docs/REHEARSAL_20261117.md) được giữ để đối chiếu.

Dataset `TC-DEMO-V1` có 24 lô và snapshot lịch sử 142 transaction hợp lệ. Lô `TC-DEMO-V1-001` hoàn chỉnh có 11 CTE; `TC-DEMO-V1-022` đã thu hồi. Lô mới `TC-REHEARSAL-20261117-001` dành riêng cho lượt diễn tập; không làm các lô cũ quay về trạng thái seed.

Luồng đầy đủ: tạo → thu hoạch → yêu cầu giao sơ chế → sơ chế nhận → sơ chế/đóng gói → yêu cầu vận chuyển → vận chuyển nhận → ghi nhận vận chuyển → yêu cầu giao phân phối → phân phối nhận → đưa lên kệ. Yêu cầu chưa chuyển đơn vị giữ lô; xác nhận đúng bên nhận mới chuyển. Consumer đọc QR/public trace ẩn danh.

## Resume, rebuild và khởi tạo là ba việc khác nhau

### Resume mạng cũ (mặc định cho bảo vệ)

```bash
bash scripts/up.sh
```

Không seed, migrate hoặc deploy định kỳ. Chứng thư backend nằm trong runtime được bảo vệ; backend mount read-only. Khi thiếu container/volume/crypto, script dừng để điều tra trước.

### Rebuild ứng dụng khi vừa sửa source

```bash
# Chỉ backend thay đổi:
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build --wait backend
# Chỉ frontend thay đổi:
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build --wait frontend
```

Kiểm dependency health và image đang phục vụ sau build; rebuild app không phải upgrade chaincode.

### Máy trống hoàn toàn

Luồng này **chưa nghiệm thu trên máy sạch**. Xem phần “Máy mới hoàn toàn” trong [WORKFLOW_V4](docs/WORKFLOW_V4.md). Cần Docker, Node/npm, Fabric binaries/images, credentials mới, mạng mới và cấp identity đúng vai trò. Không áp dụng init lên mạng đang có. Các PDF gốc và bằng chứng lịch sử được giữ nguyên để đối chiếu.

Seed là thao tác cấp dữ liệu có chủ đích trên môi trường xác định rõ, không phải một bước startup. Không chạy seed/reset trên máy demo hiện tại.

## Chế độ MySQL-only và phát triển trực tiếp

```bash
docker compose -f docker-compose.yml up -d --wait
```

Compose gốc đặt `FABRIC_ENABLED=false`; `docker compose up -d` tương đương khi `COMPOSE_FILE` chỉ chọn file gốc. Health `fabric.reason:disabled` là đúng ở chế độ này. Backend từ chối tạo lô nghiệp vụ mới nếu Fabric tắt; các lô đã có source FABRIC cần Gateway để đọc. Chế độ này không tự dừng node Fabric/operator đang chạy từ trước.

Bật đầy đủ bằng cách resume rồi áp dụng overlay:

```bash
bash scripts/start-fabric.sh
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --wait
```

Chạy Node/Vite trực tiếp dành cho phát triển: Node >=22.12; `npm ci` trong mỗi package nếu thiếu dependencies; backend đọc cấu hình riêng và mặc định cổng 8080; Vite chạy cổng 3000 khi `npm --prefix frontend start`, hoặc chỉ định `-- --port 3001` nếu cổng trống. Không chạy dev frontend trên cổng 3001 khi Docker frontend đang publish cổng này. Vite mặc định proxy `/api` tới 127.0.0.1:8080; MySQL Docker từ host dùng 3307. Để ký Fabric, Node phải dùng channel/chaincode v2, TLS và mapping identity hợp lệ; không đổi credential cũ theo ví dụ.

## Kiểm thử và bằng chứng

```bash
bash scripts/test.sh
node scripts/test-mysql.js
node scripts/test-mysql.js --delivery --fabric
bash scripts/demo.sh verify
node scripts/verify-runtime.js
```

Các suite tích hợp dùng database QA riêng và tự dọn database/user do runner tạo. Giao dịch QA và identity CA đã tạo vẫn tồn tại trên ledger. Không tính SKIP là PASS và không ghi lô demo chỉ để làm test qua.

- [Bàn giao diễn tập 17/11](docs/REHEARSAL_20261117.md): lệnh đã chạy, PASS/FAIL/SKIP, txId và giới hạn kiểm thử.
- [API và kiến trúc MySQL/Fabric](docs/API_INTEGRATION.md): luồng commit, projection và reconcile.
- [Quy trình v4](docs/WORKFLOW_V4.md) và [phân quyền tài khoản](docs/ACCOUNT_HIERARCHY.md).

Bộ Word/PDF và nguồn báo cáo cuối kỳ được người dùng tự biên soạn; không được tạo lại khi chạy test/build.

[Thực nghiệm ngày 15/11](docs/EXPERIMENT_RESULTS.md) đã đạt **100 lô / 1.100 CTE commit VALID / 100 chứng từ mô phỏng**, đối soát Fabric/MySQL/IESH và bảo toàn dữ liệu cũ. Benchmark nhỏ có 33 commit tuần tự; bulk có số đo batch 8 lô đồng thời. Các số đo này không phải năng lực tải cực đại. QR trên điện thoại qua hotspot đã được người dùng xác nhận ngày 15/11; máy sạch và restore đầy đủ vẫn chưa nghiệm thu.

## Dừng và xử lý sự cố

```bash
bash scripts/stop.sh
docker compose ps
docker compose -f docker-compose.yml -f docker-compose.fabric.yml logs --tail 80 backend fabric-operator
docker logs --tail 80 orderer.example.com
```

Stop giữ volume/ledger/MSP; resume bằng script khởi động. Không dùng `down -v`, volume prune, network down/restart hoặc restore đè để chữa startup.

Backend/SQL lỗi: kiểm MySQL healthy và endpoint dependencies. Fabric lỗi: kiểm peer/orderer/CA, channel, TLS và runtime mount; không chỉ đổi FABRIC_ENABLED. Kết quả ghi chưa rõ: tải lịch sử rồi reconcile projection nếu cần, không submit lại mù quáng. Chi tiết ở [FABRIC_STARTUP](docs/FABRIC_STARTUP.md).

QR điện thoại phải dùng `PUBLIC_BASE_URL` bằng IP Windows hiện tại, không dùng localhost của điện thoại. Chỉ mở frontend TCP 3001/LocalSubnet trên mạng Private tin cậy theo script LAN hiện có; giữ cổng nội bộ và firewall. Nếu LAN không sẵn sàng, dùng public trace localhost trên máy chiếu.

## Cấu trúc chính

`frontend/`: React/Vite; `backend/`: Express, auth/RBAC và projection MySQL; `chaincode/`: workflow/IESH; `scripts/`: resume và QA; `docs/`: hướng dẫn kỹ thuật; `reports/`: bằng chứng kiểm thử. Khóa, môi trường riêng, uploads và backup bị Git ignore.

Dự án phục vụ học tập và trình diễn. Giới hạn nghiệp vụ và hướng phát triển được ghi trong báo cáo cuối kỳ; không có Products CRUD riêng, hủy/từ chối/timeout bàn giao, email production, CRL tự động, session nhiều replica hay IoT vật lý trong phạm vi nghiệm thu này.
