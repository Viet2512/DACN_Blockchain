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

Khi dùng Docker Compose, không cần cài Node.js hoặc MySQL trên máy host.

### Chạy thủ công (không dùng Docker cho ứng dụng)

- Node.js 20 trở lên và npm
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
./scripts/up.sh
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
| Admin | `admin` | `admin123` |
| Farmer | `demo-farmer` | `demo123` |
| Processor | `demo-processor` | `demo123` |
| Transporter | `demo-transporter` | `demo123` |
| Distributor | `demo-distributor` | `demo123` |

`./scripts/seed.sh` tạo dữ liệu mẫu và có thể chạy lại mà không tạo trùng các
lô demo. Dữ liệu mặc định chạy ở local mode (`FABRIC_ENABLED=false`), nên không
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
cp .env.example .env
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
MYSQL_USER=tracechain
MYSQL_PASSWORD=tracechain_dev
FABRIC_ENABLED=false
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
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
REACT_APP_API_URL=http://localhost:8080/api
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
cd frontend && CI=true npm test -- --watchAll=false
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
docker compose down
```

`docker compose down` không xóa volume MySQL. Muốn xóa cả dữ liệu database
demo, dùng lệnh này một cách thận trọng:

```bash
docker compose down -v
```

Nếu cần làm sạch các bản ghi test rồi nạp lại dữ liệu demo:

```bash
cd backend
npm run reset:demo
npm run seed:demo
```

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
