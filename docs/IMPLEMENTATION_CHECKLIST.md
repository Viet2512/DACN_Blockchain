# Hoàn thiện đồ án — cập nhật 15/11/2026

Chuẩn bị báo cáo **thứ Ba 17/11/2026**. Giữ MySQL off-chain; bản thảo còn mô tả PostgreSQL cần cập nhật. Không sửa lịch sử hoặc reset volume. Các dấu hoàn thành dưới đây dựa trên bằng chứng đã lưu, không thay thế kiểm tra máy trước buổi báo cáo.

## Phần kỹ thuật đã kiểm chứng

- [x] P0: kiểm tra và khôi phục phụ thuộc MySQL/Fabric, giữ dữ liệu hiện có.
- [x] P0: chặn documentHash khi tạo lô, validation trước Gateway, kết quả commit/SQL failure rõ ràng.
- [x] P1: workflow v4: farmer gửi → processor nhận → sơ chế → logistics nhận → gửi retail → distributor nhận/lên kệ.
- [x] P1: holder, role/MSP/business, previousEvent, timestamp, KDE, recall; replay dùng cùng quy tắc.
- [x] P1: giữ lịch sử v3 trở về trước để đọc/kiểm tra theo phiên bản; không tự nâng dữ liệu.
- [x] P1: API, permissions, SQL projection và UI hỗ trợ workflow mới.
- [x] P1: mạng hiện có ba tổ chức, lifecycle 4.3/6, enrollment và readiness đã kiểm; seed không đổi mode âm thầm.
- [x] P1: unit/UI/typecheck; MySQL và Fabric integration trong DB riêng.
- [x] P1: benchmark nhỏ thực: 33 commit trên 3 lô; latency, throughput workload, ca từ chối, snapshot CPU/RAM và baseline HASH/IESH. Không coi là TPS cực đại hoặc tỷ lệ phát hiện mọi vi phạm.
- [x] P1: thực nghiệm 100 lô / 1.100 CTE commit VALID / 100 chứng từ mô phỏng; kiểm QSCC từng TxID, IESH, API/MySQL và liên kết chứng từ vào thu hoạch.
- [x] P1: sửa deadlock SQL khi tạo lô đồng thời; MySQL regression 9/9 đạt. Chạy lại bulk tạo thêm 0 lô/0 sự kiện/0 chứng từ, dữ liệu cũ giữ nguyên.
- [x] P1: luồng UI đủ 11 CTE, phân quyền và tài khoản `tc_*` đã có bằng chứng diễn tập; không dùng account lịch sử `demo-*` chưa rõ mật khẩu.
- [x] P2: QR trên điện thoại qua hotspot đã được người dùng xác nhận ngày 15/11; đổi mạng/IP vẫn cần kiểm tra lại.
- [x] P2: transaction pagination, healthchecks, privacy và thông điệp UI.
- [x] P2: ghi bằng chứng nghiệm thu, hướng dẫn demo và các phần chưa kiểm chứng.
- [x] Theo yêu cầu 15/11: backup rồi dọn đúng 11 lô SQL cũ, khóa tám account; giữ nguyên history Fabric và 125 lô cần giữ.
- [x] Thêm 25 lô/152 CTE và bốn nhân viên có signer CA thật; native UI đủ 11 CTE, upload/download, bốn hồ sơ, recall, public QR và chạy lại 0 CTE mới.
- [x] Đối soát toàn bộ app: 150 lô/1.405 commit VALID/101 chứng từ; 17 tài khoản demo đăng nhập được. Xem [dữ liệu live và thao tác tiếp](./LIVE_DEMO_20261117.md).

Kết quả lượt kiểm code gần nhất: backend **30 PASS/33 SKIP**, chaincode **10 PASS**, frontend **84 PASS**, typecheck/build đạt; MySQL integration riêng **9 PASS/0 SKIP**. Không cộng SKIP thành PASS. Các suite Fabric/Accounts/Delivery và UI live đã chạy ở các lượt ghi rõ trong tài liệu diễn tập.

## Cần chốt trước buổi báo cáo

- [ ] Hoàn thiện bản báo cáo và slide: kiến trúc React → Express → MySQL/Gateway → Fabric, signer cá nhân; phân biệt IESH với SHA-256, endorsement với kiểm tra nghiệp vụ, ledger với projection. Nêu rõ dữ liệu/chứng từ mô phỏng.
- [ ] Đưa kết quả thực nghiệm vào báo cáo: 100 lô/1.100 CTE/100 chứng từ; khoảng 2,052 giây Gateway → commit ở benchmark nhỏ; khoảng 3,669 tx/s cho batch 8 lô mới đồng thời. Ghi phạm vi đo, số mẫu và giới hạn; không lấy tỷ số hai workload làm mức tăng tốc.
- [ ] Tự diễn tập trọn bài có bấm giờ trên laptop/máy chiếu: đăng nhập đúng vai trò, lô hoàn tất, holder trước/sau xác nhận, TxID/IESH, public QR và lô thu hồi. Nếu cần ghi live thì tạo mã mới; không reset lô mẫu.
- [ ] Chuẩn bị dự phòng: ảnh/video từ demo thật đã che credential, báo cáo số liệu mở được offline, lô mẫu `TC-REHEARSAL-20261117-001`, lô dự phòng `TC-DEMO-V1-001/002` và lô thu hồi `TC-DEMO-V1-022`.
- [ ] Chốt phiên bản bàn giao sau review và sao lưu trạng thái sau bulk: source, MySQL, uploads và runtime Fabric/credentials lưu riêng an toàn. Không chỉ giữ SQL hoặc commit khóa/mật khẩu lên Git.
- [ ] Trước giờ báo cáo: chạy `bash scripts/up.sh`, kiểm `/api/health/dependencies`, đăng nhập lại và thử QR trên đúng mạng sẽ dùng. Chuẩn bị trình chiếu localhost nếu LAN không hoạt động.

Kịch bản bấm giờ và thao tác: [diễn tập bảo vệ](./REHEARSAL_20261117.md). Số liệu/phương pháp đo: [thực nghiệm và benchmark](./EXPERIMENT_RESULTS.md).

## Chưa nghiệm thu, không cần mở rộng chức năng trước buổi báo cáo

- [ ] Init trên máy sạch khác; không thử init lên mạng đang giữ ledger.
- [ ] Restore đầy đủ từ backup sang môi trường riêng; backup đã có không đồng nghĩa restore đã được thử.
- [ ] TPS cực đại, thống kê nhiều lượt độc lập, tải lớn, in/quét QR giấy và các trình duyệt/thiết bị chưa được kiểm.

Không thêm ERP/WMS, token, mobile native, IoT phần cứng, IPFS, CRUD MSP từ UI hoặc nâng dependency chỉ để kịp báo cáo. Chỉ sửa lỗi chặn demo nếu phát hiện khi diễn tập.

Bằng chứng hiện hành: [100 lô/TxID/chứng từ và chạy lại](../reports/bulk/demo-seed.json), [tóm tắt resume và số đo batch](../reports/bulk-resume-summary.json), [benchmark nhỏ](../reports/fabric-benchmark.json), [runtime 3 peer](../reports/delivery-runtime-current.json). [Kết quả 07/11](./IMPLEMENTATION_RESULTS.md) là tài liệu lịch sử.
