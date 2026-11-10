> **Dataset hiện hành 10/11/2026:** Dùng [DEMO_GUIDE](../DEMO_GUIDE.md) với tài khoản tc_* và 24 lô Fabric. Các tài khoản demo-* và số liệu bên dưới là bộ cũ, không được tự reset mật khẩu hoặc đổi dữ liệu của chúng.

> **Bàn giao ổn định 09/11/2026:** Xem [FINAL_DELIVERY](./FINAL_DELIVERY.md) cho startup/menu/kết quả test hiện hành. Các số liệu trong tài liệu này thuộc lượt triển khai trước.

# Hướng dẫn kiểm tra bộ dữ liệu mẫu trên Frontend

## Truy cập và tài khoản

- Frontend: http://localhost:3001
- API health: http://localhost:8080/api/health
- Mật khẩu demo lấy từ biến môi trường riêng `DEMO_PASSWORD`; không ghi mật khẩu vào tài liệu. Tài khoản cũ có thể có mật khẩu khác, seed không đổi mật khẩu của chúng.
- Tài khoản Admin: giá trị `ADMIN_USERNAME` và `ADMIN_PASSWORD` trong `.env`.

| Tài khoản | Vai trò | Doanh nghiệp |
|---|---|---|
| `demo-farmer` | Nông hộ | Nông trại Mekong Xanh |
| `demo-farmer-2` | Nông hộ | Hợp tác xã Nông nghiệp An Phú |
| `demo-processor` | Sơ chế | Trung tâm Sơ chế Tiền Giang |
| `demo-transporter` | Vận chuyển | Công ty Vận tải Lạnh Miền Tây |
| `demo-transporter-2` | Vận chuyển | Cùng doanh nghiệp vận tải, User ID riêng |
| `demo-distributor` | Phân phối | Hệ thống Phân phối Sài Gòn Fresh |

Backend đang chạy local mode để bộ mẫu chỉ nằm trong MySQL. Các lô hiển thị nguồn `LOCAL`; test hash và FSM vẫn hoạt động nhưng không được gọi là giao dịch Fabric. Ledger Fabric hiện có không bị sửa hoặc xóa.

## 1. Kiểm tra công khai, không đăng nhập

1. Mở `/trace/LOT-MAU-2026-001`.
2. Kiểm tra sản phẩm **Xoài cát Hòa Lộc loại 1**, trạng thái sẵn sàng bán và timeline 7 sự kiện.
3. Mở `/trace/LOT-MAU-2026-007`; phải thấy cảnh báo lô **RECALLED**.
4. Thử mã không tồn tại; giao diện phải báo không tìm thấy thay vì hiện dữ liệu giả.

## 2. Kiểm tra Admin

1. Đăng nhập Admin, mở **Người dùng**: có 6 tài khoản demo và không còn module CRUD Tác nhân.
2. Mở **Doanh nghiệp**: có 5 doanh nghiệp thuộc 3 MSP.
3. Mở **Tổ chức Fabric**, **Danh tính Fabric**, **Ma trận quyền** để kiểm tra mô hình phân cấp.
4. Mở **Quản lý lô hàng**: có 7 lô mẫu với 7 trạng thái khác nhau.
5. Mở chi tiết `LOT-MAU-2026-001`, chạy **Kiểm tra nhất quán IESH**, xem timeline, chứng từ và hồ sơ off-chain.
6. Xác nhận Admin chỉ giám sát, không có nút ghi CTE thay người dùng nghiệp vụ.

## 3. Kiểm tra Nông hộ

Đăng nhập `demo-farmer`:

1. Dashboard chỉ hiển thị các lô liên quan Nông trại Mekong Xanh.
2. Mở `LOT-MAU-2026-006` đang `CREATED`, ghi sự kiện **Thu hoạch**; trạng thái phải thành `HARVESTED`.
3. Trong hồ sơ lô, thêm một dòng **Nhật ký canh tác** và tải lại trang để xác nhận dữ liệu còn lưu.
4. Tạo một lô mới, chọn Trung tâm Sơ chế Tiền Giang và Sài Gòn Fresh. Lô mới phải có nguồn `LOCAL` và sự kiện tạo đầu tiên.

Đăng xuất, đăng nhập `demo-farmer-2` để xác nhận phạm vi doanh nghiệp khác và xem lô thu hồi `LOT-MAU-2026-007` bị khóa thao tác tiếp theo.

## 4. Kiểm tra Sơ chế và yêu cầu bàn giao

Đăng nhập `demo-processor`:

1. Mở `LOT-MAU-2026-005` đang `PROCESSED`.
2. Tạo **Yêu cầu bàn giao**, chọn Công ty Vận tải Lạnh Miền Tây.
3. Trạng thái phải chuyển thành `WAITING_SHIP`; current holder chưa đổi cho đến khi bên vận tải xác nhận.
4. Mở hồ sơ chất lượng và thêm kết quả `PASS`; đây là dữ liệu off-chain, không đổi FSM.

## 5. Kiểm tra hai tài khoản vận chuyển

Đăng nhập `demo-transporter`:

1. Mở `LOT-MAU-2026-004` đang `WAITING_SHIP`.
2. Xác nhận nhận hàng; trạng thái thành `IN_TRANSIT`, doanh nghiệp nắm giữ chuyển sang Vận tải Lạnh Miền Tây.
3. Thêm nhật ký nhiệt độ/độ ẩm trong tab vận chuyển.

Đăng xuất, đăng nhập `demo-transporter-2`:

1. Kiểm tra tài khoản có User ID riêng nhưng cùng doanh nghiệp.
2. Tạo một yêu cầu bàn giao khác bằng tài khoản Sơ chế, sau đó dùng tài khoản vận chuyển thứ hai để xác nhận.
3. Đối chiếu lịch sử: người xác nhận phải là User ID của tài khoản thứ hai.

## 6. Kiểm tra Phân phối

Đăng nhập `demo-distributor`:

1. Mở `LOT-MAU-2026-003` đang `IN_TRANSIT`, ghi **Nhập điểm bán** để thành `IN_RETAIL`.
2. Ghi **Trưng bày bán** để thành `READY_FOR_SALE`.
3. Mở `LOT-MAU-2026-002` đang `IN_RETAIL` và hoàn thành bước trưng bày.
4. Tải lại trang công khai của các lô để xác nhận trạng thái mới.

## 7. Các kiểm tra từ chối quan trọng

- Nông hộ không được sơ chế lô.
- Sơ chế không được xác nhận nhận hàng thay vận tải.
- Vận tải khác doanh nghiệp nhận không được xác nhận bàn giao.
- Admin không được ghi CTE.
- Lô `RECALLED` không được tiếp tục FSM; chỉ được ghi sự cố phù hợp.
- Gửi lại một form sau timeout/5xx phải kiểm tra timeline trước, không bấm lặp mù quáng.

## Dữ liệu lô ban đầu

| Mã lô | Trạng thái ban đầu | Mục đích |
|---|---|---|
| `LOT-MAU-2026-001` | `READY_FOR_SALE` | Xem chuỗi hoàn chỉnh 7 sự kiện |
| `LOT-MAU-2026-002` | `IN_RETAIL` | Test bước trưng bày |
| `LOT-MAU-2026-003` | `IN_TRANSIT` | Test hai bước phân phối |
| `LOT-MAU-2026-004` | `WAITING_SHIP` | Test xác nhận vận tải |
| `LOT-MAU-2026-005` | `PROCESSED` | Test yêu cầu bàn giao |
| `LOT-MAU-2026-006` | `CREATED` | Test thu hoạch |
| `LOT-MAU-2026-007` | `RECALLED` | Test cảnh báo và khóa FSM |

