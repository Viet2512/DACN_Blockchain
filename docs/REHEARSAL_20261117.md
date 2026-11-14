# Chốt diễn tập TraceChain — bảo vệ thứ Ba 17/11/2026

Lượt kiểm tra: đêm 14 sang rạng sáng 15/11/2026 (UTC+7), trên môi trường dev đã khôi phục. Không reset/restore đè MySQL, không deploy lại chaincode, không sửa lô cũ. Chỉ bổ sung fixture diễn tập riêng và các giao dịch QA được yêu cầu.

## Bản thực sự được kiểm thử

- HEAD nền: `b78756899da2ec122cee0b0f0ca8d5f572d1ce1f` **cộng working tree hiện tại**, không phải commit sạch đó. Giữ nguyên thay đổi có sẵn; không tự gom chúng vào commit mới.
- Đã so SHA-256 của server/storage/auth/authorization/Gateway/enrollment trong backend đang phục vụ với repo: khớp.
- Đã rebuild riêng frontend; host build và image cùng bundle `index-CTP3LeUj.js`. Không thay lifecycle Fabric. Runtime xác nhận chaincode version 4.3, schema 4, ba MSP đã đồng bộ.
- Chưa có commit mới chứa toàn bộ working tree. Khi commit hoặc sửa thêm code phải chạy lại các kiểm tra bị ảnh hưởng; không gán kết quả này cho một commit khác.
- SHA-256 tập code thay đổi đã kiểm thử: `6600614bbb6160da9aea2961b949d5217af2f404cd6de8c25338b4d219206ff8`. Tính trên đường dẫn + nội dung, sắp xếp các file thay đổi trong backend, frontend/src, chaincode, scripts và Compose, kể cả hai runner mới. Không bao gồm cấu hình riêng, tài liệu hoặc JSON bằng chứng.
- Syntax check, VS Code diagnostics, `git diff --check` và quét giá trị secrets đã biết trong cấu hình riêng trên 7 file bằng chứng/tài liệu đều đạt; giá trị secrets không được in ra.

## PASS / FAIL / SKIP

| Kiểm tra/lệnh đã chạy | PASS | FAIL | SKIP | Bản chất bằng chứng |
| --- | ---: | ---: | ---: | --- |
| `/api/health/dependencies` | Có | 0 | 0 | MySQL thật; Gateway query chaincode thật, schema 4 |
| Backend trong `bash scripts/test.sh` | 28 | 0 | 32 | Unit/API giả lập; các integration gate không bật ở lệnh này |
| Chaincode trong `bash scripts/test.sh` | 10 | 0 | 0 | Stub/identity/Map trong bộ nhớ, **không phải peer thật** |
| Frontend trong `bash scripts/test.sh` | 84 | 0 | 0 | Vitest/React với API mock |
| `node scripts/test-mysql.js` | 8 | 0 | 0 | MySQL thật, database QA riêng; lifecycle/FK/rollback/mapping/migration |
| `node scripts/test-mysql.js --accounts --fabric` | 7 | 0 | 0 | API/SQL QA + CA enrollment và commit Fabric thật |
| `node scripts/test-mysql.js --delivery --fabric` | 4 | 0 | 0 | 11 commit thật; 13 ca API và 13 ca gọi trực tiếp peer; so bất biến từng ca sau khi có lô |
| `node scripts/test-mysql.js --fabric` | 5 | 0 | 1 | Identity/commit/reconcile/concurrency thật; benchmark nghiên cứu không bật |
| `bash scripts/benchmark-fabric.sh` — bổ sung 15/11 | 6 | 0 | 0 | Bật benchmark thật; 33 CTE trên 3 lô, không thay dữ liệu dev |
| `backend/rehearsal.js prepare` | Có | 0 | 0 | App dev đang chạy; Admin → quản trị DN → nhân viên → CA operator |
| `scripts/rehearsal-browser.js` | Có | 0 | 0 | Tạo và ghi 11 CTE bằng form UI thật, API đang chạy, Fabric thật |
| `backend/rehearsal.js verify` | Có | 0 | 0 | Cùng lô trên Fabric/API/MySQL, QSCC validation code 0 cho cả 11 tx |
| Chạy lại prepare/UI | Có | 0 | 0 | Không tăng số doanh nghiệp/account/identity/lô/sự kiện; UI thêm **0 CTE** |
| `scripts/demo-browser.js` | 13 tài khoản / 94 lượt trang | 0 | 0 | UI thật, desktop 1440 và mobile 390 px; không tiến lô seed nữa |
| Typecheck/build host và Docker frontend | Có | 0 | 0 | Production build thành công |
| `node scripts/verify-runtime.js` | Có | 0 | 0 | Chỉ đọc: peer/channel/lifecycle/SQL/proxy; không chạy `--restart` |
| QR giải mã PNG, trang public mobile, API cùng origin | Có | 0 | 0 | Browser kiểm thử trong network frontend; không đồng nghĩa LAN/điện thoại thật |
| Windows tự mở `10.239.60.19:3001` | 0 | Timeout | 0 | Lặp lại bằng `Invoke-WebRequest`, dù hotspot Private và rule đã có |
| QR/điện thoại thật trên hotspot | Có, người dùng xác nhận | 0 | 0 | Người dùng báo “qr đã oke rồi” ngày 15/11; không phải phép thử phần cứng tự động |

Không cộng SKIP thành PASS. Máy sạch, in giấy và restore đầy đủ chưa được nghiệm thu. Xác nhận QR trên điện thoại đến từ người dùng; JSON kiểm thử tự động trước đó giữ đúng phạm vi tại thời điểm chạy, không sửa hồi tố thành test phần cứng tự động. Các database/user QA tạm đã được runner dọn; transaction/certificate QA đã phát sinh trên Fabric/CA vẫn tồn tại. Không xóa ledger để dọn test.

## Mô hình B và quyền

[Runner live](../backend/rehearsal.js) tạo hai doanh nghiệp FARM `TC-REHEARSAL-20261117-A/B`, cùng Org1MSP, bằng `tc_system`. Tài khoản `tc_rehearsal_admin_a/b` nhận lời mời BUSINESS_ADMIN; chính các quản trị này mời `tc_rehearsal_farm_a/b`, yêu cầu và duyệt chứng thư qua API. CA operator hiện hữu cấp chứng thư ACTIVE thật; không chép signer chung.

- `tc_rehearsal_missing` thuộc doanh nghiệp A, chưa cấp chứng thư: tạo lô trả 403 `FABRIC_IDENTITY_REQUIRED`; mã lô thử không tồn tại sau từ chối.
- Nhân viên không được mời quản trị; quản trị A không được mời nhân viên cho B hoặc cấp chứng thư cho B.
- `tc_rehearsal_farm_b` không đọc được lô của A (403), dù cùng MSP và vùng.
- Suite accounts còn kiểm lời mời hết hạn/replay, thu hồi phiên, khóa account/identity và cấm System/Business Admin ký CTE. **Khóa ký tại ứng dụng/mapping không được mô tả thành đã triển khai CRL/revoke toàn mạng Fabric.**

Mật khẩu lấy riêng từ `DEMO_PASSWORD`; không có mật khẩu, token phiên, token kích hoạt hoặc private key trong bằng chứng. Không đổi password tài khoản cũ.

## Lô mẫu và commit

Lô: **`TC-REHEARSAL-20261117-001`**, “Xoài diễn tập bảo vệ TraceChain”. Chủ là doanh nghiệp diễn tập A; các đơn vị sơ chế/vận chuyển/phân phối dùng tài khoản `tc_nv_soche01`, `tc_nv_vanchuyen01`, `tc_nv_phanphoi01` hiện có.

Kết quả: `READY_FOR_SALE`, 11 sự kiện. MySQL có đúng 11 row sự kiện; projection cùng trạng thái và `lastEventId` với QueryLot/API. Cả 11 tx dưới đây có QSCC `validationCode=0`, `COMMITTED_VALID`:

| CTE | txId |
| --- | --- |
| CREATE | `f89c151c93e84fa741db67875aac00e75fd3bcfd84ebbb88485189cdb602a448` |
| HARVEST | `cb8ce5ac42b8ecfabb8a3653cf4cbfec688ec5375be187648f744ff7a70c87fb` |
| HANDOVER_PROCESSOR | `3929e48e579bdb639cc5b35f73804b08c0a82089c416666fc6329d9164f5010a` |
| RECEIVE_PROCESSOR | `5208d64117b2bd020671f67e1eaa521d4e2e1cf0465b705b8b44f62afd4a97b1` |
| PROCESS | `4ff2730e8c3d9dedbb3b68014cf3c488a26f06fc2290f4712a2f32e73618ae8c` |
| HANDOVER_SHIP | `d1424b3dd7029fb0b278ec2ba1bbb9e21d40a0a83cb5c88041533dd9c929ea62` |
| RECEIVE_SHIP | `4a959a87c9a8771087f056f7e63f4d599a483f4558fd8e95f75a95f8522054c0` |
| TRANSPORT | `b1e41c967d58de72821635f4f6704d05c60b20b80857672e4fe6d2d541e3f341` |
| HANDOVER_RETAIL | `68c678a561e5095df8137637c0f952dd05029fbf150b989356a3f9302439a9d5` |
| DISPATCH_RETAIL | `45135e4f76643ac805a13ba2ff25ec6c2a72cbb3142bd4ec355a21a296ae67a4` |
| DISPLAY_SALE / head | `faee56463a43f384c153f60a266bf672d4363a8ac4c8c21592fcdb63b8480eb0` |

Nguồn máy đọc: [đối chiếu live và commit](../reports/rehearsal-20261117.json), [thao tác UI và 6 ca lặp](../reports/rehearsal-browser-20261117.json), [suite Fabric QA và ca từ chối](../reports/delivery-e2e.json), [13 tài khoản/94 trang](../reports/demo-browser.json), [runtime chỉ đọc](../reports/delivery-runtime-current.json).

### IESH âm và bất biến

Suite delivery gọi trực tiếp Gateway/chaincode để kiểm sai role (`RBAC_DENIED`), nhận chưa có request/sai thứ tự (`FSM_INVALID`), thiếu địa điểm (`KDE_REQUIRED`), thiếu lượng (`QUANTITY`), quality FAIL (`QUALITY`), sai doanh nghiệp cùng MSP (`WRONG_RECEIVER`), stale head (`PREVIOUS_EVENT`), và lặp request/confirm cho cả ba chặng (`FSM_INVALID`).

Sau **từng** ca âm trên lô đã tồn tại: so toàn bộ QueryLot, GetHistory, các row sự kiện, scope và projection MySQL. Các ca API kiểm đúng HTTP/mã lỗi và lưu lý do trong JSON. Hai ca Admin không được tạo chạy trước khi có lô nên không có lịch sử lô để so, không tính là bằng chứng bất biến peer.

Trên app dev, sau cả 6 thao tác request/confirm từ UI, gửi lại đúng request vừa dùng: HTTP 409 `Event does not match current lot state`, head/holder/history không đổi. Test re-hash lịch sử sai nghiệp vụ dùng `workflow.verify` **trong process**; test stub của chaincode cũng không được ghi thành test peer thật.

### Bảo toàn dữ liệu và chạy lại

Các row của 35 lô/199 sự kiện SQL có sẵn, chứng từ, scope và projection cũ được kiểm bằng fingerprint trước/sau; không rehash/chỉnh lịch sử cũ. Tài khoản cũ giữ nguyên quyền/password; `last_login_at`/`updated_at` của account được loại khỏi fingerprint vì đăng nhập thật cập nhật chúng. Audit được phép append theo thao tác thực.

Fixture thêm 2 doanh nghiệp, 5 tài khoản, 2 chứng thư và 1 lô/11 sự kiện. Tổng MySQL sau đó: 12 doanh nghiệp, 27 tài khoản, 36 lô, 210 sự kiện, 17 identity. Đây là tổng SQL gồm dữ liệu legacy, **không phải 210 commit Fabric của dataset mới**.

Chạy lại prepare giữ nguyên cả năm số đếm; chạy lại UI đi từ 11 → 11, không thêm transaction. Không chạy seed tổng lên dữ liệu hiện tại. Seed cũ được kiểm idempotence/giữ signer DISABLED trong database QA riêng.

## Frontend đã sửa

- Quyền route/menu/tab thống nhất với quyền Backend; form doanh nghiệp không cho đổi trạng thái khi thiếu quyền.
- Nút yêu cầu/cấp/thử cấp lại chứng thư dựa vào request thực và trạng thái, không hiểu nhầm PENDING mặc định là đã gửi. Chờ CA thì hiện trạng thái chờ thay vì cho bấm cấp liên tục.
- Sai mật khẩu hiện tại có thông báo riêng, không báo nhầm là thiếu quyền.
- Quản lý tác nhân không bị cắt thêm chức năng: route cũ dẫn sang Người dùng; giữ tìm kiếm ID legacy, quản trị account và identity. API/bảng actor tương thích vẫn còn.
- Browser smoke cũ không tự tiến `TC-DEMO-V1-007` nữa; mọi ghi thử UI chuyển sang lô diễn tập riêng.

Hai lượt browser đầu bị dừng ở locator `select` có nhãn bao gồm các option; đã sửa locator của bài QA và chạy lại thành công đủ 11 form. Đây không phải ca IESH bị từ chối. Bằng chứng cuối lưu các lần chạy thành công và không che phép thử Windows self-IP còn timeout.

## Kịch bản trình bày 3–5 phút

1. **0:00–0:30:** mở health dependency, chỉ ra MySQL/Fabric thật và schema 4. Không dùng health cấu hình đơn thuần để kết luận.
2. **0:30–1:15:** `tc_system` xem hai doanh nghiệp; `tc_rehearsal_admin_a` xem nhân viên A và chứng thư ACTIVE. Nêu hệ thống không cấp nhầm nhân viên B cùng MSP, Admin không ký nghiệp vụ.
3. **1:15–2:30:** mở lô mẫu bằng `tc_rehearsal_farm_a`, xem 11 sự kiện và ba cặp bàn giao. Chỉ request chưa chuyển holder; confirmation mới chuyển. Chiếu txId/head và kết quả validate. Lô đã hoàn tất nên không cố ghi lại/thu hồi.
4. **2:30–3:30:** mở public trace không đăng nhập, QR và trang mobile; điện thoại trên hotspot đã được người dùng xác nhận truy cập ngày 15/11. Kiểm lại IP khi đổi mạng; dự phòng localhost trên máy chiếu. Có thể mở `TC-DEMO-V1-022` để minh họa cảnh báo thu hồi, chỉ đọc.
5. **3:30–4:30:** giải thích IESH khác SHA-256; chiếu 13 ca peer thật bị từ chối và bất biến lịch sử. Chốt MySQL là off-chain/projection, Fabric là ledger/IESH, không chứng minh chất lượng hàng hóa ngoài đời.

Đây là trình bày lô đã nghiệm thu, không phải giả vờ tạo mới lô đó. Nếu cần diễn thao tác ghi mới: tạo mã mới bằng nút gợi ý của UI, không reset lô mẫu. Có thể trình chiếu kết quả browser E2E để chứng minh 11 form đã ghi thật.

## Lệnh tái hiện

Từ thư mục repo, giữ nguyên cấu hình riêng:

```bash
curl -fsS http://127.0.0.1:3001/api/health/dependencies
bash scripts/test.sh
node scripts/test-mysql.js --accounts --fabric
node scripts/test-mysql.js --delivery --fabric
node scripts/test-mysql.js
node scripts/test-mysql.js --fabric
node scripts/verify-runtime.js
```

Chuẩn bị fixture live (chỉ dev, có guard; không seed/reset):

```bash
docker compose -f docker-compose.yml -f docker-compose.fabric.yml run --rm --no-deps -T \
  -e DEMO_DATA_ENABLED=true -e API_URL=http://backend:8080/api \
  -e DEMO_REPORT_DIR=/rehearsal-reports -e TESTED_COMMIT="$(git rev-parse HEAD)" \
  -v "$PWD/backend/rehearsal.js:/app/rehearsal.js:ro" \
  -v "$PWD/reports:/rehearsal-reports" backend node rehearsal.js prepare
```

Browser QA dùng bộ Playwright/jsQR/pngjs đã có trong cache của máy, không thêm dependency cho app:

```bash
DEMO_DATA_ENABLED=true NODE_PATH=/home/viet/.npm/_npx/409b3430a2e31c13/node_modules \
  node scripts/rehearsal-browser.js
NODE_PATH=/home/viet/.npm/_npx/409b3430a2e31c13/node_modules node scripts/demo-browser.js
```

Đối soát bằng đúng lệnh Compose trên, đổi đối số cuối `prepare` thành `verify`. Chạy prepare và browser lần hai để kiểm không nhân đôi. Cache QA phụ thuộc máy; nếu chuyển máy cần chuẩn bị công cụ QA tương ứng, không đổi dependency ứng dụng chỉ để chạy browser test.

Frontend đã được rebuild bằng:

```bash
docker compose -f docker-compose.yml -f docker-compose.fabric.yml \
  up -d --no-deps --build --wait --wait-timeout 120 frontend
```

## QR / điện thoại: đã được người dùng xác nhận

Ngày 15/11/2026, người dùng báo “qr đã oke rồi”. Ghi PASS theo xác nhận này, không gán thành phép kiểm camera/in giấy tự động của agent. Xác nhận này được ghi riêng ở tài liệu bàn giao, không thay kết quả JSON của lượt chạy browser trước đó.

- QR trên laptop: http://127.0.0.1:3001/api/lots/TC-REHEARSAL-20261117-001/qr
- Trang điện thoại: http://10.239.60.19:3001/trace/TC-REHEARSAL-20261117-001
- API public cần đi được trên cùng origin: http://10.239.60.19:3001/api/public/trace/TC-REHEARSAL-20261117-001

1. Giữ máy tính nối hotspot `....` (Windows identity `.... 8`), IP 10.239.60.19, profile Private. Không rời mạng trong lúc thử.
2. Trên điện thoại mở trang trước khi quét. Phải hiện đúng sản phẩm, 11 sự kiện và lịch sử hợp lệ, không yêu cầu đăng nhập. Nếu có trang nhưng thiếu dữ liệu, thử URL API public phía trên.
3. Quét QR mới từ laptop bằng camera/ứng dụng quét; xác nhận URL đúng IP và mã lô, không có localhost/token. Không dùng bản QR cũ đã in.
4. Khi đổi mạng/IP phải kiểm lại, không dùng xác nhận trên hotspot này để khẳng định mọi mạng khác đều truy cập được.

Windows tự gọi IP LAN vẫn timeout. Đã kiểm profile và rule Windows/Hyper-V: chỉ cổng frontend 3001 được allow từ LocalSubnet/Private, các cổng nội bộ bị block. Thử portproxy riêng 10.239.60.19:3001 → 127.0.0.1:3001 không hiệu quả và đã gỡ, không để lại rule thử. Không tắt firewall, không mở inbound mặc định, không đổi mạng dùng chung thành Private. Không suy timeout self-IP thành điện thoại chắc chắn thất bại hay suy mobile giả lập thành điện thoại đã PASS. [Microsoft mô tả riêng host-address loopback của WSL mirrored](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#experimental-settings).

Nếu IP thay đổi: chạy script LAN chỉ đọc để lấy IP, sửa riêng PUBLIC_BASE_URL, recreate backend rồi tải QR mới. Không sửa ledger để đổi URL; backend restart làm mất phiên đăng nhập RAM.

## Benchmark nhanh — đã chạy lại ngày 15/11

Lệnh `bash scripts/benchmark-fabric.sh` đã hoàn thành 6/6 test, 0 FAIL, 0 SKIP, toàn suite khoảng 137 giây. Riêng workload đo khoảng 88,38 giây, dùng database QA riêng và Fabric/CA thật. Database QA đã dọn; dữ liệu ứng dụng dev không được seed/reset.

| Số đo | Kết quả |
| --- | ---: |
| Lô trong workload benchmark | 3 |
| Giao dịch nghiệp vụ commit hợp lệ | 33/33 |
| Gateway → commit, trung bình | 2.051,71 ms |
| Gateway → commit, p95 | 2.067,52 ms |
| Query history, trung bình / 3 mẫu | 13,27 ms |
| Ca vi phạm peer từ chối | 18/18 |
| Ca API IESH từ chối | 9/9 |
| Throughput business của workload tuần tự hỗn hợp | 0,373 tx/s |

Nguồn: [JSON benchmark](../reports/fabric-benchmark.json), [CSV](../reports/fabric-benchmark.csv). Có snapshot CPU/RAM. Thời gian workload còn bao gồm ca âm, query, research-key writes và lấy resource sample; **0,373 tx/s không phải TPS cực đại của Fabric**. Mẫu so sánh HASH/IESH chỉ có 3 lượt mỗi mode, không dùng để khẳng định ý nghĩa thống kê hoặc năng lực production. Không dùng tốc độ GET public trace làm TPS commit.

Chỉ tiêu **100 lô / hơn 600 CTE / 100 chứng từ vẫn chưa đạt từ lượt benchmark nhỏ này**. Cách làm tiếp gọn nhất: runner sinh dữ liệu mô phỏng có mã riêng, dùng lại account/identity hiện có; 100 lô hoàn tất đủ 11 CTE sẽ có 1.100 CTE, mỗi lô upload/gắn 1 chứng từ mẫu. Chỉ tính sau khi kiểm commit và liên kết chứng từ thật, không chèn thẳng SQL hoặc chỉ tăng counter.

Có thể chạy song song giữa các lô độc lập, nhưng sự kiện trong mỗi lô phải tuần tự và xử lý kết quả commit chưa rõ trước khi retry. Với số đo tuần tự hiện tại, riêng 1.100 commit khoảng 38 phút chưa kể upload/kiểm tra; mức rút ngắn khi chạy song song phải đo thử, chưa có cam kết thời gian. Chưa chạy bulk seed trong lượt này; cần chốt lưu dataset trong app dev hay chỉ kiểm thử QA tạm.

## Kiến trúc cần đưa vào báo cáo

React/Vite gọi Express qua `/api` cùng origin. MySQL giữ tài khoản, doanh nghiệp, quyền, mapping/reference danh tính, audit, hồ sơ và projection. Chứng thư/khóa signer cá nhân nằm trong runtime bảo vệ; Gateway đối chiếu mapping và certificate attributes trước khi ký. Chaincode kiểm IESH và ghi sự kiện/metadata/hash vào ledger Fabric. Sau commit hợp lệ, **Backend**, không phải chaincode, lưu projection bằng transaction MySQL. SQL và Fabric không có một transaction nguyên tử chung; lỗi lưu sau commit trả receipt để reconcile bằng cách đọc ledger, không submit lại CTE. SHA-256/IESH không chứng minh sự thật vật lý của nông sản.

Đã sửa mũi tên chaincode → MySQL sai trong [tài liệu bàn giao kiến trúc](./FINAL_DELIVERY.md), cập nhật [API](./API_INTEGRATION.md) từ actor/MSP/vùng sang user/doanh nghiệp/certificate, đủ ba chặng bàn giao và scope `IESH_V4`. Không dùng PostgreSQL hoặc khẳng định CouchDB nếu chưa có cấu hình/bằng chứng.

Bản Word/PDF báo cáo cuối kỳ đã được xóa theo yêu cầu trước và không được tạo lại. Phần trên là mô tả kỹ thuật chuẩn để đưa vào bản báo cáo bạn tự soạn; chưa soát toàn văn bản thảo Word/PDF chưa có trong repo.
