> **Cập nhật 06/11/2026:** xem [kết quả sửa lỗi và triển khai Fabric v2](./REMEDIATION_RESULTS.md) và [API hiện tại](./API_INTEGRATION.md). Nội dung bên dưới là khảo sát/kết quả của đợt trước; các hạn chế signer/Org3/ABI, rollback RAM, recall lặp và API nhật ký đã được xử lý theo báo cáo mới. 13 hash legacy vẫn được giữ nguyên.

# Mức hoàn thiện Frontend

## Phần đã triển khai

| Giai đoạn | Kết quả |
|---|---|
| 1 — Khảo sát | Source Backend/chaincode/SQL/Docker, inventory API, PDF giữa kỳ và đề cương, ma trận quyền/FSM, kế hoạch trước khi sửa code |
| 2 — Nền tảng | Nâng cấp cùng frontend sang TypeScript/Vite; Axios/TanStack Query; ErrorBoundary; sidebar/header/breadcrumb; route guards; khôi phục phiên qua /auth/me; xử lý 401/403/network/timeout |
| 3 — Nghiệp vụ | Dashboard riêng 5 vai trò nội bộ; danh sách lô, tìm kiếm/lọc/sort/pagination; tạo lô Farmer; thu hoạch/sơ chế/bàn giao/nhận/xuất điểm bán/lên kệ/thu hồi theo role-vùng-FSM; timeline; chứng từ; không sửa/xóa lịch sử |
| 4 — Công khai | /trace và /trace/:lotId; cảnh báo thu hồi/hành trình chưa hoàn tất; phạm vi xác minh trung thực; allowlist trường public; QR từ BE, tải PNG, in và xem trước |
| 5 — Admin | Users tạo/cập nhật/khóa/mở/reset và thông tin liên hệ; ID actor cũ chỉ đối soát; doanh nghiệp, Fabric Org, Fabric Identity và RBAC tách biệt; giám sát lots/events/handovers/recalls; IESH theo API; audit; báo cáo JSON từ dữ liệu thật; trạng thái cấu hình hệ thống |
| 6 — Hoàn thiện | Responsive CSS, form validation, loading/error/empty, native dialog hỗ trợ focus/ESC, skip link, label, focus states, test, typecheck và build |

Số liệu dashboard tính trên dữ liệu được API cho phép truy cập, không giả là số
lô do chính người dùng tạo khi Backend chỉ cung cấp phạm vi vùng. Số sự kiện là
số đã lưu, không phải thống kê toàn bộ giao dịch thành công/thất bại.

Mọi màn hình gọi API source thật; fixture chỉ xuất hiện trong các file test.
Không có dữ liệu nghiệp vụ hoặc tài khoản/mật khẩu mẫu hardcode trong UI.
Không thêm trang trống cho nhật ký/quality/incident chưa có API.

Không dùng Tailwind/shadcn, form framework hoặc thư viện biểu đồ bổ sung: kế thừa
CSS, native form và meter của trình duyệt để giảm dependency, giữ chức năng cốt
lõi. Giữ Router 6 và URL cũ. Không tạo dự án frontend thứ hai.

## Backend sửa để tích hợp

- Session /me, đọc lại tài khoản đang hoạt động, thu hồi phiên khi sửa/khóa/reset.
- Kiểm tra phạm vi đồng nhất với detail/history/validate/upload/download/events.
- Đọc pending MSP/vùng từ lịch sử MySQL; cho bên nhận đúng phạm vi xem yêu cầu.
- Khởi tạo lại domain state local từ dữ liệu lưu sau restart, không ghi đè state
  đang có bằng projection chậm; kiểm trùng lotId trong storage trước tạo.
- Gateway truy vấn đúng QueryLot/GetHistory, giữ nguyên contract source.
- Public projection allowlist, bỏ static upload công khai; download có quyền.
- Verify file hash thực tế; không kết luận không có tài liệu là hợp lệ.
- Gắn tài liệu ở đường ghi handover/recall cũng như events.

Không đổi chaincode source, schema, Docker network/volume, MSP hoặc database hiện có.
Test fixture chaincode được bổ sung region theo contract bắt buộc đã tồn tại.

## Tệp tạo/chỉnh sửa

| Nhóm | Tệp |
|---|---|
| App/build | frontend/package.json, package-lock.json, tsconfig.json, vite.config.ts, index.html, .env.example, Dockerfile, .dockerignore; .vscode/tasks.json |
| Nền tảng | frontend/src/main.tsx, App.tsx, types.ts, App.css, index.css, context/AuthContext.tsx, services/api.ts, hooks/queries.ts, utils/permissions.ts |
| Thành phần | components/Common.tsx, DashboardLayout.tsx, ProtectedRoute.tsx |
| Trang | pages/auth/LoginPage.tsx, dashboard/DashboardPage.tsx, lots/LotsPage.tsx, CreateLotPage.tsx, LotDetailPage.tsx, events/EventFormModal.tsx, public/TracePublicPage.tsx, shared/HistoryPage.tsx, ProfilePage.tsx, admin/AdminUsersPage.tsx, AdminPages.tsx |
| Backend | backend/server.js, auth.js, domain.js, storage.js, fabric.js; mới integrity.js |
| Kiểm thử | frontend/src/setupTests.ts, App.test.tsx, utils/permissions.test.ts, services/api.test.ts, pages/events/EventFormModal.test.tsx; backend/integration.test.js, domain.test.js; chaincode/test/traceability.test.js; scripts/test.sh |
| Tài liệu | docs/FRONTEND_IMPLEMENTATION_PLAN.md, API_INTEGRATION.md, FEATURE_COMPLETION.md, FRONTEND_TESTING.md, frontend/README.md, README.md |

Các module JavaScript Frontend cũ được thay bằng TypeScript; bỏ asset CRA mặc định
không dùng. Output production vẫn ở frontend/build để giữ quy ước cũ.

## Phần cần Backend phát triển tiếp

Contract đề xuất chi tiết ở [API_INTEGRATION](./API_INTEGRATION.md): nhật ký canh tác,
nhật ký vận chuyển, quality, incident; đổi mật khẩu tự phục vụ; hủy/từ chối bàn
giao; phân công theo cá nhân; RBAC động; quản trị tổ chức Fabric; hiệu năng đo
thật; transaction polling; phân trang/tổng hợp server; xác minh IESH đầy đủ.

## Hạn chế cần biết khi trình diễn

- Cập nhật MySQL: Docker đã hoạt động, Backend/Frontend đã cập nhật ở 8080/3001;
  API đọc dữ liệu thật và API ghi trong MySQL riêng đã kiểm chứng. Fabric vẫn tắt.
  Xem [kết quả bảo toàn dữ liệu và MySQL](./MYSQL_VERIFICATION.md).
- Gateway một certificate chung chưa hỗ trợ ký an toàn đa vai trò. Cần ánh xạ
  signer đúng actor/MSP/role/region để trình diễn Fabric thật.
- ValidateTraceHistory không xác minh lại đủ bốn nhóm IESH; thứ tự composite key
  trong lịch sử Fabric cần đối soát với thời gian/sự kiện kế trước.
- Local mode chỉ phục vụ mô phỏng nghiệp vụ, không có tính bất biến Fabric.
  Chưa có transaction lock SQL để bảo đảm ghi đồng thời đa tiến trình.
- Projection MySQL và Fabric không commit nguyên tử. Nếu Fabric đã commit mà
  MySQL lỗi, cần quy trình đồng bộ lại; FE không tự retry giao dịch ghi.
- Tổng hợp lịch sử dùng N+1 API; khi dữ liệu lớn cần endpoint tổng hợp/phân trang.
- Quyền hiện theo role/vùng và bên nhận; chưa thể nhận diện đầy đủ quyền sở hữu
  hay tổ chức đang quản lý nếu projection không có thông tin đó.
- Upload đã lưu nhưng người dùng đóng form có thể chưa gắn sự kiện; chưa có API
  dọn chứng từ chưa gắn. UI không tuyên bố tài liệu đó đã ghi lên Blockchain.

Hướng dẫn chạy và đăng nhập ở [Frontend README](../frontend/README.md). Tài khoản
seed chỉ dùng khi đã được nạp hợp lệ; lần triển khai này không chạy seed/reset DB.

## Xác nhận kiểm tra

Lượt chạy cuối của `scripts/test.sh`: 33/33 ca đạt (8 Backend, 2 chaincode,
23 Frontend), typecheck/build thành công. Frontend dev đã khởi động ở cổng 3002
vì 3001 bận; API mặc định vẫn ở 8080, không thay đổi cấu hình đang có.

## Cập nhật MySQL

MySQL 8.4.13 thực tế, 8 bảng InnoDB/utf8mb4. Không migration dữ liệu hay đổi schema
đang chạy. Đã backup, xác nhận fingerprint 8 bảng trước/sau giống hệt và giữ
nguyên container/volume MySQL. Backend bỏ startup ALTER/backfill/re-hash, dùng
UTC/DATETIME(3), giữ DATE dưới dạng ngày, sửa INSERT IGNORE để lỗi rollback.
Cấu hình mật khẩu qua .env bị Git bỏ qua, không nhúng vào image.

Hai test MySQL thật bổ sung đã đạt, trong DB tạm riêng tự dọn; tổng kiểm chứng
35 ca riêng biệt (33 mặc định + 2 MySQL). UI /trace/LOT-DEMO-001 đã hiển thị dữ
liệu thật và không tràn ngang ở 1440/768/390 px. Backend hiện có 13 hash lịch sử
legacy không ràng buộc timestamp đúng, được giữ nguyên và báo cần đối soát.
