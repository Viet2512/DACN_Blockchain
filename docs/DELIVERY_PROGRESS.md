# Tiến độ ổn định và bàn giao 09/11/2026

## Khảo sát trước chỉnh sửa

- Docker Engine 29.8.2 hoạt động; frontend/backend/MySQL healthy, backend restart count 0.
- Gateway đọc được chaincode schema 4 trên tracechannel-v2; 3 peer, orderer và CA chạy.
- Đã đọc AGENTS.md, PDF đề cương 21 trang và báo cáo giữa kỳ: yêu cầu Fabric >=3 org và IESH; PDF còn ghi PostgreSQL, triển khai thực tế dùng MySQL theo yêu cầu hiện tại.
- Working tree có nhiều thay đổi có sẵn; không stage/commit/đổi branch.

## Phân loại và phạm vi cần chạm

| Mức | Phát hiện | Xử lý |
| --- | --- | --- |
| P0 | Chưa phát hiện sau health thực tế | Tiếp tục xác minh bằng giao dịch thật |
| P1 | Startup mặc định production có thể làm invitation demo trả 503 | Cấu hình Fabric local, script up và kiểm thử script |
| P1 | Seed tạo staff nhưng --pending không tìm thấy yêu cầu cấp chứng thư | Seed account, kiểm thử seed trên DB riêng; giữ signer bị disable |
| P1 | Chưa có một bài test nối hierarchy với toàn bộ 11 CTE, QR, restart | Bổ sung delivery integration, tái sử dụng runner DB riêng |
| P2 | Admin thiếu lối vào chuỗi cung ứng; Business Admin thiếu menu Lô hàng | navigation, tabs và UI tests; giữ routes cũ |
| P3 | Email/Redis/Kafka/analytics/enterprise | Không triển khai |

Các caller phải giữ: scripts/up.sh, scripts/seed.sh, seed CLI; API user/identity hiện có; navigationFor/adminSections/DashboardLayout; tests/fixtures; tài liệu startup. Không sửa network/channel/chaincode nếu test không chứng minh lỗi. Dữ liệu test chỉ nằm trong database tracechain_test_*; Fabric test ghi lot QA có mã riêng và giữ bằng chứng append-only.

## Checklist

- [x] Kiểm tra Engine/container/health trước chỉnh sửa.
- [x] Khảo sát code, PDF và các caller.
- [x] Sửa startup/seed/menu và kiểm thử.
- [x] Chạy delivery E2E hợp lệ và bất hợp lệ trên MySQL/Fabric thật.
- [x] Kiểm tra 3 peer, lifecycle, endorsement và đồng bộ block.
- [x] Kiểm tra persistence sau restart, không xóa volume.
- [x] Chạy build/unit/integration/regression.
- [x] Cập nhật báo cáo bàn giao và hướng dẫn bảo vệ.

Không coi kết quả lượt làm trước là PASS của lượt nghiệm thu này cho đến khi chạy lại kiểm tra tương ứng.

## Kết quả cuối

Đã hoàn tất các bước trên trong phạm vi nghiệm thu. Xem [bàn giao](./FINAL_DELIVERY.md), [E2E](../reports/delivery-e2e.json), [browser](../reports/delivery-browser.json), [persistence](../reports/delivery-runtime.json) và [health cuối](../reports/delivery-runtime-current.json). Backend 22 PASS/32 SKIP, chaincode 10 PASS, frontend 60 PASS, MySQL 8 PASS, accounts/Fabric 7 PASS, delivery 4 PASS, Fabric regression 5 PASS/1 SKIP. Các mục chưa nghiệm thu (camera/in giấy, browser Business Admin đầy đủ, click đóng menu mobile, restore backup, máy sạch) được đánh dấu NOT VERIFIED trong báo cáo. Không còn task bị giữ hoặc backend/frontend QA tạm.

## P1 phát hiện ở smoke cuối

System Admin đăng nhập thật PASS; DEMO_PASSWORD của cấu hình không khớp bốn staff demo cũ (401). Đã đối chiếu các cấu hình riêng mà không in secret; chưa thay password/phiên hiện có. [Bằng chứng FAIL](../reports/delivery-live-smoke.json). Cần người dùng chọn giữ credential cũ hoặc đồng bộ bốn account demo, rồi smoke lại. Không coi kết quả QA PASS là thay thế cho FAIL cấu hình này.

- [ ] Chốt credential bốn tài khoản demo: giữ password cũ được cung cấp riêng hoặc đồng bộ theo lựa chọn đã gửi; sau đó chạy lại live smoke. Không reset khi chưa có lựa chọn.
