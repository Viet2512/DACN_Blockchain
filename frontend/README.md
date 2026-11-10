> **Bản bàn giao hiện hành:** [Hướng dẫn demo và kết quả test](../docs/FINAL_DELIVERY.md). Frontend hiện có TypeScript/Vite và mô hình System → Business Admin → Staff.

> **07/11/2026 — Workflow v4, chaincode 4.2:** Xem [hướng dẫn hiện hành](../docs/WORKFLOW_V4.md). Các mô tả phiên bản cũ bên dưới là tài liệu lịch sử; dùng hướng dẫn v4 cho bàn giao và deployment.

> **Cập nhật 06/11/2026:** đã thêm hồ sơ canh tác/chất lượng/vận chuyển/sự cố, đổi mật khẩu, readiness và đồng bộ ledger sau lỗi lưu. Nguồn LOCAL/FABRIC được xác định từng lô. Xem [API hiện tại](../docs/API_INTEGRATION.md) và [kết quả nghiệm thu](../docs/REMEDIATION_RESULTS.md).

# TraceChain Frontend

React 19 + TypeScript + Vite, React Router 6, Axios và TanStack Query. Giao diện
hoàn toàn tiếng Việt, dùng CSS responsive cùng thư mục Frontend hiện có. Không
cần thêm Tailwind/shadcn để thay hệ thống component vừa đủ cho ứng dụng này.

## Chạy

Yêu cầu Node.js 22.12+ (khuyến nghị bản 22 LTS), npm và Backend/MySQL hiện có.

```bash
cd frontend
npm ci
[ -f .env ] || cp .env.example .env
npm start
```

Mặc định http://localhost:3000. Giữ cổng khớp QR Backend:

```bash
npm start -- --port 3001
```

Vite tự tìm cổng khác nếu cổng bận; xem URL terminal. Đặt `VITE_API_URL` trong
`.env` trỏ API thật (mặc định http://localhost:8080/api). `REACT_APP_API_URL` cũ
vẫn được hỗ trợ để Compose chạy nguyên cấu hình. Không ghi token/secret vào env FE.
Thay env phải restart Vite; production cần build lại.

Backend chạy bằng hướng dẫn [README gốc](../README.md). Không tự reset/seed DB
khi chỉ cần chạy Frontend. Nếu dùng Compose có sẵn, sau khi Docker khả dụng:

```bash
# từ thư mục gốc; rebuild source, không xóa volume
docker compose up -d --build backend frontend
```

Dockerfile dùng npm ci, PORT=3000 trong container, Compose publish 3001. Docker
network/volume/schema/chaincode không bị thay đổi bởi bản Frontend này.

## Đăng nhập và luồng

Dùng tài khoản Backend đang có. Nếu đã chủ động chạy seed hợp lệ của repository,
các username là `demo-farmer`, `demo-processor`, `demo-transporter`,
`demo-distributor`; thông tin demo nằm trong README gốc và seed hiện có.
Frontend không điền sẵn mật khẩu và không tạo tài khoản giả.

- Sau login chuyển `/:role/dashboard`; `/dashboard` giữ tương thích.
- `/lots`: tìm kiếm, lọc, sắp xếp và phân trang dữ liệu API.
- `/lots/new`: chỉ Farmer; `/lots/:lotId`: chi tiết, timeline, nghiệp vụ hợp lệ,
  chứng từ, QR và kiểm tra lịch sử.
- `/handovers`, `/history`, `/recalls`, `/profile`: dùng chung theo quyền.
- `/admin/*`: users, actors, organizations, roles, lots, events, handovers,
  recalls, blockchain, verification, audit-logs, reports.
- `/trace`, `/trace/:lotId`: tra cứu công khai không cần login.

Lô: CREATED → HARVESTED → PROCESSED → WAITING_SHIP → IN_TRANSIT → IN_RETAIL →
READY_FOR_SALE; thu hồi theo quyền thực tế. Không có bàn giao Farmer trực tiếp.

Bên giao chọn tác nhân vận chuyển; API ràng buộc MSP và vùng, chưa ràng buộc cá
nhân. Bên nhận đúng MSP/vùng mới xác nhận. Ghi xong refetch, không cập nhật giả.
Kết quả ghi không rõ do timeout/5xx: đóng form, tải lại lịch sử, kiểm tra sự kiện
mới nhất trước khi gửi tiếp; không bấm gửi lại mù quáng.

## QR dùng điện thoại

Backend cấu hình `PUBLIC_BASE_URL` bằng URL Frontend điện thoại truy cập được,
ví dụ địa chỉ LAN. API URL trong env FE cũng phải truy cập được từ điện thoại.
`localhost` trên điện thoại là chính điện thoại. Nút in dùng hộp thoại in của
browser với CSS ưu tiên QR; PNG được tải từ endpoint Backend.

## Kiểm tra và build

```bash
npm run typecheck
npm test
npm run build
```

Production output ở `build/`, giữ đường dẫn output cũ. Host tĩnh cần rewrite
các URL SPA về `index.html`; browser gọi API qua HTTPS khi FE dùng HTTPS.
Trong VS Code có task `Frontend: chạy Vite`; scripts start/dev tương đương.

Không dùng Web Vitals hay nội dung CRA mặc định. Không có dữ liệu nghiệp vụ
localStorage; token phiên ở sessionStorage, refresh trang gọi `/auth/me`.

## Tài liệu và giới hạn

- [Kế hoạch và phân tích Backend](../docs/FRONTEND_IMPLEMENTATION_PLAN.md)
- [Contract API và phần thiếu](../docs/API_INTEGRATION.md)
- [Mức hoàn thiện](../docs/FEATURE_COMPLETION.md)
- [Kiểm thử](../docs/FRONTEND_TESTING.md)

Local mode là off-chain, không phải Fabric. `/health` chỉ báo cấu hình. Gateway
hiện dùng một certificate chung; cần triển khai signer theo tác nhân trước khi
trình diễn đa vai trò trên Fabric thật. UI công bố phạm vi kiểm chứng API thực
sự hỗ trợ, không khẳng định xác minh IESH đầy đủ.

## MySQL đã kiểm chứng

Frontend Docker hiện chạy tại http://localhost:3001, API tại :8080 dùng MySQL
8.4 thật. Xem [báo cáo cập nhật MySQL](../docs/MYSQL_VERIFICATION.md). Giữ nguyên
tài khoản Backend hiện có; phiên cũ mất sau khi Backend được cập nhật. 13 hash
lịch sử legacy đang được giữ nguyên và hiển thị cần đối soát, không bị sửa để
biến kết quả thành hợp lệ.
