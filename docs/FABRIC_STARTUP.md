> **Hướng dẫn hiện hành 09/11/2026:** [FINAL_DELIVERY](./FINAL_DELIVERY.md), khởi động bằng `bash scripts/up.sh`. Các phiên bản và lệnh cũ bên dưới là lịch sử, không dùng để deploy lại network.

> **07/11/2026 — Workflow v4, chaincode 4.2:** Xem [hướng dẫn hiện hành](./WORKFLOW_V4.md). Các mô tả phiên bản cũ bên dưới là tài liệu lịch sử; dùng hướng dẫn v4 cho bàn giao và deployment.

# Bật mạng Fabric hiện tại — cập nhật 06/11/2026

Mạng đã được cấu hình và kiểm thử giao dịch thật. Backend dùng channel `tracechannel-v2`, chaincode `traceability_v2` version 2.0 sequence 1, Org1/Org2/Org3. Channel `tracechannel` và chaincode 1.0 cũ vẫn được giữ nguyên (height 6, không nâng cấp/ghi đè).

## Khởi động lại sau khi mở Docker Desktop

Chạy tại thư mục dự án:

```bash
bash scripts/start-fabric.sh
docker compose up -d
curl http://localhost:8080/api/health/dependencies
```

Môi trường cục bộ đã đặt COMPOSE_FILE trong `.env`, chọn cả hai file Compose. Có thể chạy tường minh:

```bash
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build --no-deps backend frontend
```

Readiness phải có `mysql: true` và `fabric.ready: true` cùng channel/chaincode v2. `/api/health` chỉ báo cấu hình; không đủ chứng minh kết nối.

[start-fabric.sh](../scripts/start-fabric.sh) hiện chỉ resume sáu container gốc và CA/peer Org3 nếu có. Khi thiếu container, script báo lỗi và giữ nguyên dữ liệu; không tự gọi network down. Không chạy `network.sh down`, `network.sh restart`, `docker compose down -v` trên mạng có dữ liệu.

## Nguồn dữ liệu và danh tính

- Bốn actor có vùng TG-001 đã có certificate riêng có role, region, actorId. Backend chọn signer theo phiên đã xác thực, không nhận tên certificate/private key từ browser.
- Runtime credentials ở thư mục backups/fabric-runtime bị gitignore, chỉ mount read-only vào Backend. Bundle không chứa khóa CA admin/peer/orderer.
- Actor legacy GLOBAL không được cấp signer. Không sửa vùng/lịch sử cũ chỉ để cho phép ký.
- Ba lô cũ vẫn LOCAL; lô tạo mới qua Backend đang bật Fabric mới dùng ledger v2. Không biến UUID cũ thành transaction ID hoặc tự ghi lịch sử giả lên chain.
- Sửa/tạo actor off-chain không đồng nghĩa cấp certificate. Sau khi đăng ký actor có MSP/role/vùng hợp lệ, người vận hành có quyền CA chạy `node scripts/enroll-fabric-actors.js`, rồi cập nhật riêng Backend. Script giữ certificate có sẵn và tạo mới ở thư mục riêng.

## Kiểm tra ledger chỉ đọc

```bash
cd fabric-samples/test-network
export PATH="$PWD/../bin:$PATH"
export FABRIC_CFG_PATH="$PWD/../config"
source scripts/envVar.sh
setGlobals 1
peer channel list
peer channel getinfo -c tracechannel
peer channel getinfo -c tracechannel-v2
peer lifecycle chaincode querycommitted -C tracechannel-v2
setGlobals 3
peer channel getinfo -c tracechannel-v2
```

## Xử lý kết quả ghi chưa rõ

Không tự retry POST nghiệp vụ. Đọc lại lịch sử trước. Nếu ledger commit nhưng MySQL chưa lưu được, dùng nút đồng bộ trong chi tiết lô hoặc sau lỗi tạo lô:

`POST /api/fabric/lots/:lotId/reconcile` với Bearer hợp lệ và body `{}`.

Endpoint chỉ query ledger rồi lưu projection; không tạo giao dịch mới. Không cho thay thế lô LOCAL bằng lô cùng ID từ ledger; không ghi đè hash event đã có. Khi SQL khác ledger, `GET /lots/:id/validate` trả anomaly để điều tra.

## Tái tạo môi trường mới

Hướng dẫn này dành cho mạng hiện có, không phải lệnh reset/cài trắng. Nếu mất container/volume/crypto, phải kiểm backup và metadata trước. Các bước đã dùng cho v2 là tạo channel mới bằng `network.sh createChannel`, thêm Org3 bằng script addOrg3 với `-c tracechannel-v2 -ca`, deploy chaincode tên mới, cài/approve Org3 và enroll bốn actor. Không chạy lại onboarding channel hoặc deploy sequence 1 mù quáng khi tài nguyên đã tồn tại.

Xem [kết quả sửa lỗi, migration, backup và test](./REMEDIATION_RESULTS.md), [kịch bản](./SYSTEM_TEST_SCENARIOS.md), [kết quả từng ca](./SYSTEM_TEST_RESULTS.csv).
