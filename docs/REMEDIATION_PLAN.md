# Kế hoạch xử lý lỗi và thiếu chức năng

1. Sửa tính nhất quán: draft nghiệp vụ không sửa RAM trước SQL commit, khóa hàng và đối chiếu lastEventId trong transaction; gắn chứng từ trong cùng transaction; không sửa metadata lịch sử khi cập nhật actor.
2. Sửa validation: thời gian, JSON, kích thước trường, bên nhận hợp lệ, khóa tuyệt đối sau recall, loại file và liên kết chứng từ; kiểm quyền actor/organization/role mỗi request, TTL phiên và đổi mật khẩu.
3. Sửa chaincode: lịch sử theo previousEventId, FSM khởi tạo, sáu nhóm kiểm tra IESH, bất biến cơ bản luôn bật; test bằng fixture trước khi deploy.
4. Fabric: cấu hình signer theo actor, API readiness, namespace chaincode mới để giữ nguyên ledger cũ, onboarding Org3 và certificate có thuộc tính; chỉ bật khi kiểm thử thực tế đạt.
5. Bổ sung nhật ký off-chain canh tác, chất lượng, vận chuyển, sự cố và giao diện; migration thêm bảng không xóa/ghi đè dữ liệu cũ.
6. Chạy test Backend/chaincode/Frontend, MySQL riêng, Fabric thật; cập nhật bảng kết quả theo bằng chứng. Không đánh dấu PASS những ca chưa thực hiện.

Phạm vi tác động: domain và callers tại server/seed/tests; storage/schema/migration; auth/session; Fabric Gateway/chaincode/config/certificates; API client/types/forms; tài liệu và test fixtures. Không reset MySQL hay volume, không tự viết lại 13 hash legacy. Các chức năng được Master Prompt quy định chỉ thực hiện khi có Backend (RBAC động, metrics nghiên cứu, cancel/reject) được đánh giá theo contract thay vì mô phỏng.
