> **Nghiệm thu 09/11/2026:** Xem [bàn giao và kịch bản hiện hành](./FINAL_DELIVERY.md). Môi trường Fabric local mặc định development để demo lời mời; không cần email server.

# Workflow v4 và hướng dẫn demo

Phiên bản hiện tại dùng MySQL off-chain, khác PostgreSQL trong PDF. Chaincode lifecycle 4.3, schema nghiệp vụ 4. Không sửa lịch sử hay tự nâng lô cũ.

## Quy trình

Mã lô mới chỉ dùng chữ ASCII, số, gạch ngang/gạch dưới và được chuẩn hóa chữ hoa, tránh hai khóa ledger khác nhau va chạm do collation MySQL.

1. FARMER tạo lô và chỉ định doanh nghiệp sơ chế/phân phối.
2. FARMER thu hoạch: quantity > 0, unit kg/tấn/kiện.
3. FARMER gửi CTE_HANDOVER_PROCESSOR, chọn đúng doanh nghiệp sơ chế và vùng nhận.
4. PROCESSOR ký CTE_RECEIVE_PROCESSOR; lúc này mới đổi custodian.
5. PROCESSOR ghi CTE_PROCESS: quantity/unit, qualityResult=PASS.
6. PROCESSOR gửi CTE_HANDOVER_SHIP, chỉ định doanh nghiệp vận chuyển và vùng.
7. TRANSPORTER ký CTE_RECEIVE_SHIP; cập nhật holder, vùng.
8. TRANSPORTER có thể ghi CTE_TRANSPORT (vị trí, nhiệt độ, độ ẩm) lên ledger. Nhật ký ở tab hồ sơ vẫn là off-chain và được ghi nhãn riêng.
9. TRANSPORTER gửi CTE_HANDOVER_RETAIL cho doanh nghiệp phân phối được chỉ định.
10. DISTRIBUTOR ký CTE_DISPATCH_RETAIL để nhận, quantity/unit bắt buộc. Giữ tên CTE cũ nhưng nghĩa là xác nhận nhận tại điểm phân phối.
11. DISTRIBUTOR ghi CTE_DISPLAY_SALE với qualityResult=PASS.
12. Consumer dùng QR/trace để xem lịch sử public và cảnh báo. Actor có quan hệ với lô có thể recall với lý do, kể cả sau khi lô chuyển vùng. Sau recall không ghi thêm CTE.

Request không chuyển holder; người nhận có certificate đúng User/Business Organization/MSP/vùng mới chuyển holder. Người cùng doanh nghiệp được quyền nhận; không phân công độc quyền một tài xế. Owner nguồn không thay đổi, custodian thay đổi theo xác nhận.

Ứng dụng từ chối tạo/cập nhật lô bằng database nếu Fabric tắt; LOCAL writes chỉ có trong test dùng DB QA riêng. Lô schema <=3 chỉ đọc; source LOCAL/FABRIC được giữ nguyên. Không tự backfill hash, đổi UUID thành TxID hoặc nhập lịch sử giả lên ledger. Muốn tiếp tục thử workflow mới hãy tạo mã lô mới.

## Gợi ý khi nhập dữ liệu

- Tạo lô: dùng **Gợi ý mã lô** hoặc nhập mã riêng; tên sản phẩm, nguồn gốc và địa điểm có danh sách gợi ý từ các lô được phép xem. Vẫn có thể nhập giá trị mới.
- Bàn giao sang sơ chế/phân phối: bên nhận đã được phân công sẽ được chọn sẵn. Bàn giao vận chuyển: chọn công ty thực tế nhận hàng. Luôn xác nhận mã vùng với bên nhận trước khi gửi.
- Khối lượng: có thể bấm **Dùng số lượng trước** rồi chỉnh theo lượng thực tế của công đoạn. Đơn vị đi cùng số lượng đã ghi, không tự quy đổi.
- Nhiệt độ, độ ẩm, ngày nghiệp vụ và kết quả chất lượng cần nhập theo thực tế. Ví dụ trong ô chỉ là hướng dẫn, không được tự lưu hoặc tự chọn Đạt.
- Hồ sơ canh tác/sự cố có gợi ý hoạt động, nhóm sự cố; ô quản trị có ví dụ mã doanh nghiệp, tài khoản và mã vùng. Có thể nhập nội dung khác phù hợp.

## Chạy lại môi trường đang có

```bash
bash scripts/start-fabric.sh
# Chỉ khi chưa có migration 006; backup trước khi chạy:
bash scripts/backup-mysql.sh
node scripts/migrate-workflow.js
node scripts/migrate-accounts.js
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build
curl -fsS http://localhost:3001/api/health/dependencies
```

Mở http://localhost:3001. Backend 8080, MySQL host 3307. Frontend dùng `/api` qua proxy nên điện thoại không gọi localhost của chính nó. Đặt PUBLIC_BASE_URL thành địa chỉ máy chủ mà điện thoại truy cập được rồi recreate backend; không đưa secret vào file Git.

Tài khoản chưa có certificate hiển thị PENDING và không ký được. CA operator chạy `node scripts/enroll-fabric-users.js --pending` rồi restart backend nếu mapping thay đổi. Admin ứng dụng không có quyền CA registrar hoặc ký thay actor. Khóa tài khoản không tương đương revoke certificate/CRL.

Nếu tài khoản có quyền tạo lô nhưng nhận lỗi `FABRIC_IDENTITY_REQUIRED`, cần cấp chứng thư đúng người dùng, không thêm role admin. Có thể cấp riêng bằng `node scripts/enroll-fabric-users.js --username <ten-tai-khoan>`. Khi bổ sung signer mới vào bundle đã mount, backend đọc mapping mới ở lần gửi tiếp theo; không cần restart chỉ để nạp người dùng mới. Không tự gửi lại giao dịch khi kết quả commit chưa rõ.

Không chạy seed/reset lên dữ liệu cần giữ. Seed đã giữ tài khoản/lô đang có; muốn bộ lô demo mới chọn `DEMO_LOT_PREFIX=LOT-V4 bash scripts/seed.sh` một cách chủ động. Script seed không tự tắt Fabric. Các lô mẫu là dữ liệu trình diễn, giao dịch của chúng vẫn phải commit thật khi Fabric bật.

## Máy mới hoàn toàn

1. Cài Docker, Node/npm, Fabric binaries/images; cấu hình `.env` riêng theo mẫu. Cài dependencies ở backend, frontend, chaincode bằng npm ci.
2. Chạy `bash scripts/init-fabric.sh`. Script tạo channel, CA và ba org, deploy 4.3; từ chối chạy nếu phát hiện network/crypto cũ. Chưa chạy nghiệm thu trên máy sạch trong lượt này.
3. Chạy `docker compose -f docker-compose.yml up -d --build` để bootstrap MySQL và tài khoản admin theo cấu hình riêng.
4. Tạo doanh nghiệp/user qua UI hoặc seed accounts có chủ đích. Chạy `node scripts/enroll-fabric-users.js --pending` bằng quyền CA operator để tạo bundle runtime, kể cả reader.
5. Chạy Compose với cả hai file như trên để bật Gateway thật. Khi mạng đã có thì chỉ resume, tuyệt đối không network down/reset hoặc xóa volume.

## Cập nhật từ phiên bản trước

Backup trước; chạy unit tests, build chaincode rồi `node scripts/package-chaincode-offline.js`. Script upgrade nhận các version đã biết 2.0/3.0/4.0/4.1/4.2, đọc sequence đã commit và tăng đúng một bước để nâng 4.3; nếu đã 4.3 thì chỉ kiểm tra và dừng. Với definition lạ phải đối chiếu lifecycle trước; không reset network hoặc rollback ledger. Môi trường nghiệm thu hiện là 4.3/sequence 6.

## Kiểm thử và nghiên cứu

```bash
bash scripts/test.sh
node scripts/test-mysql.js
node scripts/test-mysql.js --fabric
bash scripts/benchmark-fabric.sh
# Đối chiếu bảng lịch sử với backup cụ thể, restore vào DB riêng:
node scripts/verify-workflow-preservation.js backups/<backup-truoc-cap-nhat>.sql
```

Integration tạo DB `tracechain_test_<random>` riêng và tự dọn. Giao dịch QA đã commit và CA identities không biến mất khi xóa DB QA; giữ chúng để có bằng chứng, không coi là dữ liệu nghiệp vụ ứng dụng.

Báo cáo benchmark ở `reports/fabric-benchmark.json`: thời gian Gateway gửi tới commit hợp lệ, query, TPS business của workload tuần tự, tỷ lệ chặn, snapshot CPU/RAM. Baseline HASH so với IESH dùng cùng lịch sử và ghi vào composite key `research`, không ghi vào `lot`/`event`, không tắt validation CTE. Overhead này là kiểm tra lịch sử kèm research-key write, không phải đo loại bỏ IESH khỏi giao dịch nghiệp vụ production. Mẫu nhỏ không chứng minh công suất tải lớn.

## Đồng bộ và giới hạn

Ghi ledger trước, chỉ lưu projection sau commit. Không có distributed transaction MySQL–Fabric. Khi ledger đã commit nhưng hydrate/SQL lỗi, API trả 503 với lotId, transactionId, ledgerCommitted và reconciliationRequired; frontend chặn retry mù. Dùng nút reconcile để đọc lại ledger và lưu projection mà không submit CTE mới. Nếu SQL bị sửa làm hash cũ khác, reconcile từ chối ghi đè bằng chứng; cần đối soát riêng.

Kết quả IESH kiểm quy trình và dữ liệu đã ghi, không chứng minh sự thật vật lý hay giấy chứng nhận VietGAP. Chứng từ gắn hash cần đối soát file riêng. Dữ liệu hồ sơ off-chain không tự được neo lên ledger.

Chưa có cancel/reject/timeout cho yêu cầu bàn giao, CRL tự động, session đa replica, kiểm thử tải lớn hoặc nghiệm thu QR camera/in giấy. Đây là các mục tiếp theo; không có nút giả cho chức năng chưa triển khai.
