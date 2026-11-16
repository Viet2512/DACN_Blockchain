# Thực nghiệm và benchmark TraceChain

> **Sau khi dọn/thêm dữ liệu theo yêu cầu ngày 15/11:** app có [150 lô/1.405 CTE/101 chứng từ](./LIVE_DEMO_20261117.md), trong đó bộ benchmark 100 lô/1.100 CTE vẫn nguyên vẹn và đã kiểm lại. Phần bảo toàn 36 lô/210 sự kiện ở lượt trước bên dưới là bằng chứng trước khi người dùng cho phép dọn 11 lô cũ. [Baseline gốc đã lưu riêng](../reports/bulk/preservation-before-cleanup-20261115.json); [chuyển baseline có manifest](../reports/bulk/baseline-transition-20261115.json). Không dùng số đo cũ để tuyên bố đã benchmark toàn bộ 150 lô.

Ngày kiểm tra tiếp: **15/11/2026**, Asia/Bangkok. Dữ liệu sản phẩm và PDF trong bộ thực nghiệm là mô phỏng, không phải chứng nhận chất lượng ngoài đời. Không tạo lại báo cáo Word/PDF cuối kỳ.

## Benchmark đã hoàn tất trước lượt này

[Kết quả JSON](../reports/fabric-benchmark.json) được tạo lúc 17:51 UTC ngày 14/11, tức **00:51 ngày 15/11** giờ Việt Nam/Thái Lan. Workload sử dụng MySQL QA riêng, ba tổ chức Fabric và chaincode `traceability_v2` phiên bản 4.3; không phải mô phỏng commit trong SQL.

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Lô hoàn tất | 3 |
| CTE commit hợp lệ | 33/33 |
| Gateway → commit trung bình | 2.051,71 ms |
| Gateway → commit p50 / p95 / p99 | 2.048,43 / 2.067,52 / 2.086,26 ms |
| Query history trung bình | 13,27 ms; 3 mẫu |
| Ca âm bị peer từ chối | 18/18 |
| Ca âm bị API từ chối, gồm RBAC | 9/9 |
| Truy cập sai doanh nghiệp bị API từ chối | 3/3; nằm trong 9 ca trên |
| Thời gian workload | 88,38 giây |
| Throughput nghiệp vụ của workload tuần tự hỗn hợp | 0,373 tx/s |
| BenchmarkWrite HASH / IESH trung bình | 2.074,12 / 2.130,80 ms |
| Chênh lệch thời gian BenchmarkWrite | +2,73%; 3 mẫu/mode |

Gateway latency là thời gian wrapper submit tới commit, không phải thời gian thuần consensus. Mẫu số của throughput gồm cả ca âm, query, research-key writes và lấy snapshot tài nguyên. Không dùng 0,373 tx/s làm TPS cực đại của Fabric hoặc lấy tốc độ GET public trace làm TPS commit.

`BenchmarkWrite` so sánh kiểm tra toàn lịch sử bằng HASH/IESH rồi ghi research key riêng, không tắt validation của CTE nghiệp vụ. Query HASH/IESH lần lượt trung bình 18,13/15,74 ms, chênh lệch −13,19%; chỉ ba mẫu/mode nên không kết luận IESH nhanh hơn HASH. Không có kết luận ý nghĩa thống kê. Các tỷ lệ từ chối chỉ áp dụng cho tập ca đã thử, không phải xác suất phát hiện mọi loại gian lận.

Lệnh tái hiện benchmark nhỏ:

```bash
bash scripts/benchmark-fabric.sh
```

Lệnh tạo database/user QA riêng rồi dọn chúng. Giao dịch và certificate đã phát sinh trên Fabric/CA vẫn tồn tại.

## Nguyên nhân lượt thực nghiệm trước bị dừng

Bộ dữ liệu có prefix `TC-DEMO-V1-BULK-` đã chạy dở. Khi kiểm tra, chín lô hoàn tất đủ 11 CTE; ba lô `007`, `009`, `010` có CREATE trên ledger nhưng thiếu row/projection SQL. Log backend ghi `ER_LOCK_DEADLOCK`, không phải IESH từ chối lịch sử hợp lệ.

Đã tái hiện bằng tám lô tạo đồng thời trong database QA: trước sửa có sáu transaction SQL bị deadlock. [Hàm lưu dùng chung](../backend/storage.js) nay chỉ thử lại transaction SQL đã rollback khi gặp đúng lỗi deadlock, tối đa năm lần, chờ tăng dần 20–80 ms giữa các lần. Không gửi lại transaction Fabric. Những lỗi khác, stale head và bất biến hash vẫn giữ kiểm tra/từ chối như trước.

[Regression MySQL](../backend/mysql.integration.test.js) kiểm tám lô độc lập cùng được lưu thành công, mỗi lô đúng một sự kiện và một audit. Sau sửa suite đạt **9 PASS, 0 FAIL, 0 SKIP**, bao gồm chống ghi từ head cũ, rollback, hash và khôi phục liên kết chứng từ.

Runner bulk dùng cố định tối đa tám lô độc lập đồng thời. Trong mỗi lô, 11 sự kiện vẫn tuần tự. Đã bỏ chọn mức song song bằng tốc độ hai batch đầu vì các batch chứa lô đã hoàn tất sau resume sẽ làm phép so sánh sai lệch. Mọi lỗi ghi chưa rõ vẫn phải đọc ledger/reconcile, không retry POST nghiệp vụ mù.

## Bộ thực nghiệm 100 lô — đã hoàn tất

Dataset được lưu trong app dev với mã `TC-DEMO-V1-BULK-001` đến `TC-DEMO-V1-BULK-100`, dùng lại account và signer cá nhân hiện có. Mỗi lô có sản phẩm thuộc một trong mười loại nông sản của fixture, ba cặp bàn giao/tiếp nhận và một PDF mô phỏng riêng.

| Kiểm tra | Kết quả |
| --- | ---: |
| Lô đủ luồng, READY_FOR_SALE | 100/100 |
| CTE / TxID duy nhất | 1.100/1.100 |
| QSCC xác nhận validationCode=0 | 1.100/1.100 |
| History Fabric khớp API, projection và row MySQL | 100/100 |
| IESH và truy xuất public hợp lệ | 100/100 |
| Chứng từ đúng hash file và gắn đúng TxID thu hoạch | 100/100 |
| Hash chứng từ phân biệt | 100 |
| Lô cũ / sự kiện cũ giữ nguyên fingerprint | 36 / 210 |
| Metadata chứng từ / scope / projection / hồ sơ cũ giữ nguyên | 6 / 36 / 29 / 57 dòng |

Lượt tiếp tạo mới 88 lô, ghi thêm 910 sự kiện sau CREATE và upload 91 chứng từ; reconcile đúng ba lô đã CREATE trên Fabric nhưng thiếu SQL. Tổng này cộng với phần đã có mới thành 100 lô/1.100 CTE/100 chứng từ, không coi cả dataset là được tạo mới trong lượt này. Không thêm account/doanh nghiệp, không chèn SQL để giả lập CTE.

[Bằng chứng từng lô](../reports/bulk/demo-seed.json) chứa đầy đủ TxID, receipt QSCC và ánh xạ hash chứng từ → sự kiện. [Tóm tắt lượt resume](../reports/bulk-resume-summary.json) giữ số lượng tạo thêm, ba lần reconcile, thời gian batch và fingerprint baseline; [baseline gốc](../reports/bulk/preservation-before-cleanup-20261115.json) được giữ nguyên. Tại thời điểm trước dọn, app có 136 lô/1.310 sự kiện SQL gồm cả 36 lô/210 sự kiện cũ; đây không phải toàn bộ commit mới hoặc tổng app sau dọn.

Đã chạy lại **chính lệnh seed** lần hai: tạo thêm **0 doanh nghiệp, 0 account, 0 lô, 0 sự kiện, 0 chứng từ**, reconcile 0; tiếp tục đối soát đủ 100 lô/1.100 commit/100 chứng từ và fingerprint cũ. Report `demo-seed.json` hiện là kết quả lần chạy lại này; số lượng/thời gian lượt hoàn tất đầu được giữ riêng trong tóm tắt resume.

### Số đo batch song song

Chỉ lấy **10 batch hoàn toàn mới**, từ lô `017` đến `096`: mỗi batch tám lô, tổng 80 lô/880 CTE đã kiểm commit. Tổng thời gian các batch là **239.829 ms**, throughput nghiệp vụ khoảng **3,669 tx/s**. Hai batch đầu có lô resume và batch cuối chỉ bốn lô bị loại khỏi phép đo này.

Thời gian batch gồm tạo lô, gửi sự kiện qua API, upload PDF, kiểm tra và ghi hồ sơ phụ trợ; không gồm lượt đối soát toàn dataset sau đó. Số đo suy ra từ wall time batch và TxID đã kiểm chứng, không có mẫu latency riêng từng transaction cho bulk. Máy vẫn có workload Docker khác. Đây là throughput tại mức tám lô đồng thời, **không phải TPS cực đại**; khác workload benchmark tuần tự 0,373 tx/s nên không dùng tỷ số hai số này để tuyên bố mức tăng tốc. [CSV số đo](../reports/bulk-benchmark.csv).

### Chạy tiếp và kiểm lại

```bash
bash scripts/up.sh
# Ghi có guard; chỉ tiếp tục prefix fixture, không reset dữ liệu:
DEMO_DATA_ENABLED=true bash scripts/demo.sh seed --bulk
# Đối soát dữ liệu nghiệp vụ, không gửi CTE mới:
bash scripts/demo.sh verify --bulk
```

Seed/verify ghi report tương ứng trong thư mục `reports/bulk/`. Không chạy nhiều tiến trình seed cùng lúc. PDF fixture ghi rõ `SYNTHETIC TEST DOCUMENT`; hash chỉ kiểm tính toàn vẹn nội dung, không chứng minh nông sản/chứng nhận là thật. Các CTE bulk đã commit tồn tại trên ledger; không xóa/reset mạng để dọn dataset.

## Kiểm thử mã nguồn

`bash scripts/test.sh`: backend **30 PASS, 33 SKIP**, chaincode **10 PASS**, frontend **84 PASS**; TypeScript và production build đạt. Các integration SKIP trong lệnh mặc định không được tính PASS; suite MySQL nêu trên được bật và chạy riêng trên DB QA.

Không đổi schema, chaincode, API contract, mật khẩu hoặc quyền để hoàn tất thực nghiệm. Đã backup MySQL trước khi tiếp tục. Kiểm tra fingerprint của runner áp dụng cho dữ liệu nghiệp vụ ngoài prefix bulk; login/audit hợp lệ có thể cập nhật hoặc thêm dòng theo cơ chế ứng dụng.

`node scripts/verify-runtime.js` cuối lượt đạt: ba MSP/peer đồng bộ, chaincode 4.3, backend/frontend/MySQL hoạt động và không có lot QA delivery/browser trong database ứng dụng. [Snapshot chỉ đọc](../reports/delivery-runtime-current.json). Lượt này không yêu cầu restart để đo persistence.
