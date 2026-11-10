# Hoàn thiện đồ án — 07/11/2026

Giữ MySQL off-chain; PDF mô tả PostgreSQL cần cập nhật. Không sửa lịch sử, reset volume hoặc thao tác Git.

- [x] P0: kiểm tra và khôi phục phụ thuộc MySQL/Fabric, giữ dữ liệu hiện có.
- [x] P0: chặn documentHash khi tạo lô, validation trước Gateway, kết quả commit/SQL failure rõ ràng.
- [x] P1: workflow v4: farmer gửi → processor nhận → sơ chế → logistics nhận → gửi retail → distributor nhận/lên kệ.
- [x] P1: holder, role/MSP/business, previousEvent, timestamp, KDE, recall; replay dùng cùng quy tắc.
- [x] P1: giữ lịch sử v3 trở về trước để đọc/kiểm tra theo phiên bản; không tự nâng dữ liệu.
- [x] P1: API, permissions, SQL projection và UI hỗ trợ workflow mới.
- [x] P1: mạng hiện có ba tổ chức, lifecycle 4.3/6, enrollment và readiness đã kiểm; seed không đổi mode âm thầm.
- [ ] P2: nghiệm thu init trên máy sạch khác; script có guard chống reset nhưng chưa dựng mới trên môi trường đang giữ ledger.
- [x] P1: unit/UI/typecheck; MySQL và Fabric integration trong DB riêng.
- [x] P1: benchmark thực: commit/query latency, TPS, Rdetect, unauthorized rejection, CPU/RAM; baseline riêng.
- [x] P2: transaction pagination, healthchecks, privacy và thông điệp UI.
- [x] P2: ghi bằng chứng nghiệm thu, hướng dẫn demo và các phần chưa kiểm chứng.

Không làm ERP/WMS, token, mobile native, IoT phần cứng, IPFS hoặc CRUD MSP từ UI.

Bằng chứng: [kết quả](./IMPLEMENTATION_RESULTS.md), [benchmark](../reports/fabric-benchmark.json), [bảo toàn dữ liệu](../reports/data-preservation.json).
