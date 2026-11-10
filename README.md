> **Demo đầy đủ 10/11/2026:** Xem [DEMO_GUIDE](DEMO_GUIDE.md) để dùng dataset 24 lô Fabric, 13 tài khoản mới và các lệnh demo:check/seed/verify/test. [Audit thực thi](docs/SYSTEM_AUDIT.md) ghi kết quả và giới hạn kiểm chứng. Dữ liệu cũ được giữ nguyên.

> **Bản bàn giao 09/11/2026:** Dùng [hướng dẫn nghiệm thu và demo hiện hành](docs/FINAL_DELIVERY.md). Các ghi chú phiên bản cũ bên dưới được giữ để tham khảo.

> **07/11/2026 — Workflow v4, chaincode 4.2:** Xem [hướng dẫn hiện hành](docs/WORKFLOW_V4.md). Các mô tả phiên bản cũ bên dưới là tài liệu lịch sử; dùng hướng dẫn v4 cho bàn giao và deployment.

> **06/11/2026:** Backend đã kết nối Fabric v2 thật (Org1/Org2/Org3, signer riêng); lô cũ vẫn LOCAL. Chạy lại bằng `bash scripts/start-fabric.sh` rồi `docker compose up -d` trên môi trường đã cấu hình. Xem [hướng dẫn hiện tại](docs/FABRIC_STARTUP.md) và [kết quả sửa lỗi/test](docs/REMEDIATION_RESULTS.md).

# TraceChain - IESH supply-chain demo

Ứng dụng truy xuất nguồn gốc nông sản theo lô, xây dựng cho đồ án Đại học Sài
Gòn. Hệ thống gồm giao diện React, REST API Express, MySQL và smart contract
Hyperledger Fabric. Lớp IESH (Identity - Event - State - Handover) kiểm tra
tính nhất quán của nghiệp vụ; hash chứng từ chỉ kiểm tra tính toàn vẹn, không
chứng minh dữ liệu đầu vào là đúng.

## 1. Yêu cầu môi trường

### Cách khuyến nghị: Docker Compose

- Git
- Docker Desktop hoặc Docker Engine
- Docker Compose v2 (`docker compose version`)
- Ít nhất 4 GB RAM trống

Khi chỉ chạy ứng dụng bằng Docker Compose, không cần MySQL/Node.js trên host.
Cấp chứng thư, migration và kiểm thử từ WSL vẫn cần Node/npm cùng Fabric binaries hiện có.

### Chạy thủ công (không dùng Docker cho ứng dụng)

- Node.js 22.12 trở lên và npm
- MySQL 8 trở lên (hoặc chỉ chạy MySQL bằng Docker)
- Git

Kiểm tra phiên bản:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 2. Cài từ GitHub

```bash
git clone <URL_REPOSITORY_GITHUB>
cd DoAnBlockchain
```

Thay `<URL_REPOSITORY_GITHUB>` bằng URL repository thực tế. Không cần commit
`node_modules`, file `.env`, dữ liệu MySQL hoặc thư mục build lên GitHub.

## 3. Chạy nhanh bằng Docker Compose (khuyến nghị)

Từ thư mục gốc dự án:

```bash
[ -f .env ] || cp .env.example .env
# Điền thông tin kết nối/mật khẩu; với database cũ phải giữ credential hiện có.
./scripts/up.sh
# Chỉ seed khi chủ động cần dữ liệu demo và đã đặt DEMO_PASSWORD.
./scripts/seed.sh
```

Nếu Linux báo không có quyền thực thi script:

```bash
chmod +x scripts/*.sh
./scripts/up.sh
```

Mở ứng dụng tại [http://localhost:3001](http://localhost:3001). API health ở
[http://localhost:8080/api/health](http://localhost:8080/api/health).

Các container sử dụng những cổng sau:

| Thành phần | URL/cổng |
|---|---|
| Frontend | `http://localhost:3001` |
| Backend API | `http://localhost:8080` |
| MySQL từ máy host | `localhost:3307` |

Cổng frontend là `3001` (không phải `3000`) để tránh xung đột với ứng dụng
khác. Backend trong Docker kết nối MySQL qua cổng nội bộ `3306`; chỉ khi kết
nối từ máy host mới dùng cổng `3307`.

### Tài khoản demo

| Vai trò | Username | Password |
|---|---|---|
| Admin | Theo `ADMIN_USERNAME` | Theo `ADMIN_PASSWORD` |
| Farmer | `demo-farmer` | Theo `DEMO_PASSWORD` khi seed |
| Processor | `demo-processor` | Theo `DEMO_PASSWORD` khi seed |
| Transporter | `demo-transporter` | Theo `DEMO_PASSWORD` khi seed |
| Distributor | `demo-distributor` | Theo `DEMO_PASSWORD` khi seed |

Bộ mẫu mới còn có `demo-farmer-2` và `demo-transporter-2` để kiểm tra nhiều người dùng/doanh nghiệp. Xem [kịch bản test Frontend](docs/DEMO_TEST_GUIDE.md).

`./scripts/seed.sh` chỉ dùng khi chủ động muốn tạo dữ liệu mẫu. Script có thể cập
nhật tài khoản/tác nhân demo đã tồn tại; không chạy trên dữ liệu thật cần bảo toàn. Dữ liệu mặc định chạy ở local mode (`FABRIC_ENABLED=false`), nên không
cần khởi động Fabric để xem giao diện và thực hiện kịch bản demo.

## 4. Chạy thủ công frontend/backend

### Khởi động MySQL

Có thể chỉ chạy MySQL bằng Docker:

```bash
docker compose up -d mysql
```

Hoặc dùng MySQL cài sẵn trên máy, tạo database `traceability` và user có
quyền truy cập database đó.

### Cấu hình backend

```bash
cd backend
[ -f .env ] || cp .env.example .env
npm install
npm start
```

Backend chạy ở [http://localhost:8080](http://localhost:8080). Khi dùng MySQL
container, các giá trị quan trọng trong `.env` là:

```env
PORT=8080
MYSQL_ENABLED=true
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3307
MYSQL_DATABASE=traceability
MYSQL_USER=<tai-khoan-MySQL-hien-co>
MYSQL_PASSWORD=<mat-khau-MySQL-hien-co>
FABRIC_ENABLED=false
ADMIN_USERNAME=<tai-khoan-admin-khoi-tao>
ADMIN_PASSWORD=<mat-khau-admin-khoi-tao>
```

Nếu MySQL chạy trực tiếp trên máy, đổi `MYSQL_PORT` thành `3306`. Không đưa
`.env` lên GitHub; hãy dùng [backend/.env.example](backend/.env.example) làm
mẫu.

### Nạp dữ liệu demo

Mở terminal khác:

```bash
cd backend
npm run seed:demo
```

### Khởi động frontend

Mở terminal khác:

```bash
cd frontend
npm install
npm start
```

Frontend mặc định chạy tại [http://localhost:3000](http://localhost:3000) khi
chạy thủ công. Nếu cần đổi địa chỉ API, tạo `frontend/.env`:

```env
VITE_API_URL=http://localhost:8080/api
```

## 5. Kịch bản demo 10 phút

1. Chạy `./scripts/up.sh && ./scripts/seed.sh`.
2. Đăng nhập bằng `demo-farmer`, mở lô `LOT-DEMO-001` và xem timeline 7 CTE.
3. Bấm **Kiểm tra nhất quán IESH**; kết quả phải hợp lệ.
4. Mở `/trace/LOT-DEMO-001` để xem truy xuất công khai không cần đăng nhập.
5. Đăng nhập `admin` để xem quản lý user và audit log.
6. Đăng nhập processor/transporter để trình diễn bàn giao hai bước.
7. Mở `LOT-DEMO-002` để xem trạng thái `RECALLED` và các thao tác bị khóa.

## 6. API chính

```text
GET  /api/health
GET  /api/public/trace/:lotId
GET  /api/lots/:id/history
GET  /api/lots/:id/validate
GET  /api/lots/:id/verify-documents
POST /api/lots/:id/handover/request
POST /api/lots/:id/handover/confirm
POST /api/lots/:id/recall
GET  /api/admin/audit-log
```

API chuẩn hóa lỗi theo dạng `{step, code, message}`. Dữ liệu off-chain được
lưu trong MySQL ở các bảng `lots`, `trace_events`, `event_documents`,
`organizations`, `actors` và `actor_roles`.

## 7. Hyperledger Fabric (tùy chọn)

Chỉ cần phần này khi muốn chạy giao dịch thật trên Fabric. Docker Compose mặc
định chạy local mode để cài đặt đơn giản.

### Cài và khởi động network

Repository đã bao gồm `fabric-samples`. Đảm bảo Docker đang chạy, sau đó:

```bash
./scripts/start-fabric.sh
```

Script tạo channel `tracechannel` và deploy chaincode `traceability`. Nếu chạy
thủ công:

```bash
cd fabric-samples/test-network
./network.sh deployCC \
  -c tracechannel \
  -ccn traceability \
  -ccp ../../chaincode \
  -ccl typescript
```

### Build/test chaincode

```bash
cd chaincode
npm install
npm run build
npm test
```

### Bật Fabric cho backend

Trong `backend/.env`, đặt:

```env
FABRIC_ENABLED=true
FABRIC_NETWORK_ROOT=/duong-dan-tuyet-doi/DoAnBlockchain/fabric-samples/test-network
FABRIC_ORG=org1.example.com
FABRIC_MSP_ID=Org1MSP
FABRIC_USER=User1@org1.example.com
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
FABRIC_CHANNEL=tracechannel
FABRIC_CHAINCODE=traceability
```

`FABRIC_NETWORK_ROOT` nên là đường dẫn tuyệt đối trên máy đang chạy backend.
Khi bật Fabric, các giao dịch tạo lô và ghi sự kiện chỉ được lưu vào MySQL sau
khi Fabric commit thành công.

## 8. Kiểm thử, benchmark và quản trị

Chạy toàn bộ kiểm thử/build:

```bash
./scripts/test.sh
```

Hoặc chạy riêng:

```bash
cd backend && npm test
cd chaincode && npm test
cd frontend && npm test
```

Benchmark endpoint truy xuất công khai:

```bash
./scripts/benchmark.sh 100
```

Kết quả nằm trong `reports/benchmark.csv` và `reports/benchmark.svg`.

Xem log hoặc dừng hệ thống Docker:

```bash
docker compose logs -f backend
docker compose ps
bash scripts/stop.sh
```

Script chỉ dừng ứng dụng, MySQL và các container Fabric hiện hữu; giữ nguyên
volume, ledger và chứng thư. Khởi động lại bằng `bash scripts/up.sh`.
Không reset hoặc seed lại database đang có để cập nhật ứng dụng. Test dữ liệu
riêng bằng `node scripts/test-mysql.js --delivery --fabric`.

## 9. Xử lý lỗi thường gặp

- **Không mở được `localhost:3001`:** kiểm tra `docker compose ps` và log
  frontend bằng `docker compose logs frontend`.
- **Port đã được sử dụng:** dừng tiến trình đang dùng cổng `3001`, `8080` hoặc
  `3307`, hoặc chỉnh mapping trong `docker-compose.yml`.
- **Backend không kết nối MySQL:** chờ healthcheck MySQL hoàn tất; khi chạy
  backend ngoài Docker phải dùng `MYSQL_HOST=127.0.0.1` và `MYSQL_PORT=3307`.
- **Không chạy được script trên Linux:** chạy `chmod +x scripts/*.sh`.
- **Fabric lỗi khi bật `FABRIC_ENABLED=true`:** kiểm tra network đã up, chaincode
  đã deploy và `FABRIC_NETWORK_ROOT` trỏ đúng đến `fabric-samples/test-network`.

## 10. Cấu trúc thư mục

```text
.
├── backend/          # Express API, auth, MySQL projection, upload chứng từ
├── frontend/         # React dashboard và public trace page
├── chaincode/        # Hyperledger Fabric chaincode TypeScript
├── fabric-samples/   # Fabric test network
├── scripts/          # Script khởi động, seed, test, benchmark
├── reports/          # Kết quả benchmark
└── docker-compose.yml
```

## License

Dự án phục vụ mục đích học tập và trình diễn.

## Frontend TypeScript/Vite

Frontend đã được nâng cấp tại cùng thư mục, có dashboard theo vai trò, quản lý
lô/FSM, bàn giao, QR công khai và quản trị. Xem [hướng dẫn Frontend](frontend/README.md),
[kế hoạch](docs/FRONTEND_IMPLEMENTATION_PLAN.md), [API](docs/API_INTEGRATION.md),
[mức hoàn thiện](docs/FEATURE_COMPLETION.md) và [kiểm thử](docs/FRONTEND_TESTING.md).
`REACT_APP_API_URL` vẫn được hỗ trợ cho Compose hiện có. `/uploads/*` không còn
công khai; dùng endpoint tải chứng từ có xác thực. Không thay đổi database/volume.

## Kiểm tra MySQL và bảo toàn dữ liệu

Backend dùng MySQL 8.x với mysql2/promise, InnoDB và utf8mb4. Không cần migration
PostgreSQL. Khởi động Backend không tự ALTER/backfill hay tính lại hash lịch sử.
Cấu hình mật khẩu đặt trong .env bị Git bỏ qua, không nhúng vào Docker image.

```bash
./scripts/backup-mysql.sh
# Kiểm thử ghi chỉ trong database tạm riêng, tự dọn sau khi xong:
node scripts/test-mysql.js
```

Xem [báo cáo MySQL, backup và rollback](docs/MYSQL_VERIFICATION.md). Với database
đang có, không chạy lại schema/seed/reset để cập nhật ứng dụng.

### Tài khoản phân cấp

Xem [triển khai, kiểm thử và hướng dẫn System Admin → Business Admin → Staff](docs/ACCOUNT_HIERARCHY.md). Môi trường hiện có cần chạy migration 007 trước khi triển khai backend mới. Lời mời thủ công chỉ bật với NODE_ENV=development/test; production không trả token.
