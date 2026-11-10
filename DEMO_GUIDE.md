# TraceChain — hướng dẫn bảo vệ đồ án

Dataset **TC-DEMO-V1** tách khỏi dữ liệu cũ. Dữ liệu mẫu mô phỏng nghiệp vụ; giao dịch Fabric là thật. Không reset database, ledger hoặc volume.

## 1. Khởi chạy trên Windows/WSL

Mở Docker Desktop, đợi Engine running. Bật Settings → Resources → WSL Integration cho distro đang dùng. Mở terminal WSL tại repository:

```bash
bash scripts/up.sh
bash scripts/demo.sh check
curl -fsS http://localhost:3001/api/health/dependencies
```

Frontend http://localhost:3001; backend http://localhost:8080; MySQL host 127.0.0.1:3307. Không dùng cổng 3000 của dự án khác.

Health phải có mysql=true, fabric.ready=true, schemaVersion=4. Startup sử dụng cả [Compose ứng dụng](docker-compose.yml) và [override Fabric](docker-compose.fabric.yml). Ba MSP: Org1MSP/Org2MSP/Org3MSP; channel tracechannel-v2; chaincode traceability_v2.

Máy mới: xem [khởi tạo](docs/WORKFLOW_V4.md#máy-mới-hoàn-toàn). Cài trắng trên máy khác **NOT VERIFIED**; không chạy init lên mạng đang có.

## 2. Credentials và seed

Chỉ seed trong development/demo đã xác định rõ. `DEMO_PASSWORD` là cấu hình riêng, 12–1024 ký tự, không ghi vào Git/log/báo cáo. Mở cấu hình môi trường riêng hoặc password manager để lấy giá trị backend đang sử dụng. ADMIN_USERNAME/ADMIN_PASSWORD là credential quản trị hiện có, không nhất thiết trùng mật khẩu demo.

Trên môi trường **mới chưa seed**, có thể nhập kín từ terminal:

```bash
read -rsp 'Mật khẩu demo mới: ' DEMO_PASSWORD
export DEMO_PASSWORD
DEMO_DATA_ENABLED=true bash scripts/demo.sh seed
```

Giữ mật khẩu này trong cấu hình riêng để chạy lại. Trên môi trường đã seed, dùng đúng mật khẩu cũ; đổi biến môi trường không đổi mật khẩu tài khoản. Runner dừng khi credential không khớp, không reset tài khoản.

Trên môi trường đã cấu hình:

```bash
DEMO_DATA_ENABLED=true bash scripts/demo.sh seed
bash scripts/demo.sh verify
bash scripts/demo.sh test
```

Alias: `npm --prefix backend run demo:check`, `demo:seed`, `demo:verify`, `demo:test`. Khi seed vẫn cần DEMO_DATA_ENABLED=true từ môi trường gọi lệnh. Không tự seed khi startup.

Doanh nghiệp/tài khoản được tạo qua API có xác thực. Tám staff yêu cầu/được duyệt certificate qua RBAC, CA operator cấp signer riêng; sau đó mỗi người gửi CreateLot/RecordEvent thật. Không dùng signer admin hoặc tắt IESH khi CA lỗi.

Chạy lại chỉ bổ sung lịch sử đúng prefix còn thiếu; không lùi trạng thái lô đã demo tiếp. Khi ledger commit nhưng SQL thiếu, runner đọc ledger và gọi reconcile, không submit lại mù. Lịch sử khác dự kiến được giữ và báo lỗi. Chạy seed tuần tự, không chạy nhiều tiến trình cùng lúc.

## 3. Tài khoản đăng nhập ngay

Tất cả tài khoản mới dùng mật khẩu demo riêng đã cấu hình. Các tài khoản cũ được giữ nguyên.

| Vai trò | Username |
| --- | --- |
| System Admin | tc_system |
| Business Admin sản xuất | tc_admin_sanxuat |
| Business Admin sơ chế | tc_admin_soche |
| Business Admin vận chuyển | tc_admin_vanchuyen |
| Business Admin phân phối | tc_admin_phanphoi |
| Nhà sản xuất | tc_nv_sanxuat01, tc_nv_sanxuat02 |
| Sơ chế | tc_nv_soche01, tc_nv_soche02 |
| Vận chuyển | tc_nv_vanchuyen01, tc_nv_vanchuyen02 |
| Phân phối | tc_nv_phanphoi01, tc_nv_phanphoi02 |

HTX Nông Sản Miền Tây và Công ty Sơ Chế Mekong cùng Org1MSP; Công ty Vận Tải Đồng Bằng thuộc Org2MSP; Công ty Phân Phối Sài Gòn thuộc Org3MSP. Không tạo thêm MSP.

Danh mục gồm 10 nông sản Việt Nam, mã NS-01…NS-10, đơn vị kg. Schema hiện tại lưu sản phẩm trên lô, không có module Products độc lập; fixture dùng đúng schema, không thêm bảng/UI giả.

## 4. Lô mẫu

Mã đầy đủ dạng **TC-DEMO-V1-001**. Đây là trạng thái seed ban đầu; thao tác tiếp hợp lệ được giữ nguyên, xem report verify mới nhất.

Snapshot nghiệm thu 10/11/2026: 24 lô, **142 sự kiện/transaction VALID**, 39 yêu cầu/31 xác nhận bàn giao. Lô 007 hiện đã được sơ chế tiếp nhận trong browser E2E; các lô 006, 008–009 và 023 vẫn sẵn để tiếp tục demo.

| Số cuối | Trạng thái / thao tác tiếp |
| --- | --- |
| 001–003 | READY_FOR_SALE; đủ 11 CTE, QR/hành trình hoàn tất |
| 004–005 | CREATED; nhà sản xuất thu hoạch |
| 006–007 | HARVESTED; gửi sơ chế; 007 dành riêng browser E2E |
| 008–009, 023 | WAITING_PROCESSOR; sơ chế nhận |
| 010–011 | RECEIVED_PROCESSOR; sơ chế ghi công đoạn/chất lượng |
| 012–013 | PROCESSED; gửi vận chuyển |
| 014–015, 024 | WAITING_SHIP; vận chuyển nhận |
| 016–017 | IN_TRANSIT; ghi vận chuyển/gửi phân phối |
| 018–019 | WAITING_RETAIL; phân phối nhận với số lượng/đơn vị |
| 020–021 | IN_RETAIL; đưa lên kệ với quality PASS |
| 022 | RECALLED; cảnh báo và khóa thao tác |

Hai staff cùng doanh nghiệp có chung phạm vi doanh nghiệp. Sơ chế/phân phối được phân công ngay khi tạo; vận chuyển tham gia sau yêu cầu giao. Không phải tất cả vai trò thấy cùng danh sách.

## 5. Kịch bản 10–15 phút

1. tc_system: xem doanh nghiệp, tài khoản, ma trận quyền, giao dịch có validation code thật.
2. tc_admin_sanxuat: xem nhân viên/hoạt động đúng doanh nghiệp, không có quyền ghi CTE.
3. tc_nv_sanxuat01: mở 006, gửi sơ chế; holder chưa đổi khi chờ nhận.
4. tc_nv_soche01: nhận đúng lô, kiểm tra holder đổi; dùng 010 để sơ chế, nhập lượng >0, kg và Đạt.
5. tc_nv_vanchuyen01: nhận 014, ghi vận chuyển hoặc gửi tới đơn vị phân phối được chỉ định.
6. tc_nv_phanphoi01: nhận 018 (số lượng/đơn vị), hoặc đưa 020 lên kệ (Đạt).
7. Không đăng nhập: http://localhost:3001/trace/TC-DEMO-V1-001, xem 11 sự kiện và IESH. Mở 022 để xem thu hồi.
8. Chạy demo:test: sai quyền/tenant, chưa bàn giao, bỏ bước, stale previousEventId, số lượng âm đều phải bị từ chối; ledger không đổi.

Không có reject/cancel/timeout bàn giao, nên không tạo trạng thái giả. Số đo trong seed là ví dụ trình diễn, không phải cảm biến vật lý.

## 6. Đối soát và bằng chứng

demo:verify chỉ đọc dữ liệu nghiệp vụ: query lot/history Fabric, IESH, so SQL metadata/events/phạm vi doanh nghiệp/projection. Mỗi TxID được peer QSCC GetTransactionByID xác nhận validationCode=0. Login kiểm tra vẫn cập nhật last_login_at theo cơ chế xác thực thông thường.

```bash
bash scripts/demo.sh verify
node scripts/verify-runtime.js
docker compose -f docker-compose.yml -f docker-compose.fabric.yml ps
docker compose -f docker-compose.yml -f docker-compose.fabric.yml logs --tail=50 backend fabric-operator
```

[Verify](reports/demo-verify.json), [ca từ chối](reports/demo-test.json), [browser](reports/demo-browser.json), [audit](docs/SYSTEM_AUDIT.md) không chứa mật khẩu/token/private key. TxID có trong lịch sử nội bộ và trang Giao dịch & hạ tầng.

Đọc số lượng SQL, không in mật khẩu:

```bash
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "SELECT status,COUNT(*) FROM lots WHERE lot_id LIKE '\''TC-DEMO-V1-%'\'' GROUP BY status; SELECT COUNT(*) AS demo_events FROM trace_events WHERE lot_id LIKE '\''TC-DEMO-V1-%'\'';"'
```

## 7. Kiểm thử và phục hồi service

```bash
bash scripts/test.sh
node scripts/test-mysql.js
node scripts/test-mysql.js --accounts --fabric
node scripts/test-mysql.js --delivery --fabric
node scripts/test-mysql.js --identity --fabric
bash scripts/backup-mysql.sh
node scripts/verify-runtime.js --restart
bash scripts/demo.sh verify
```

Integration tạo database QA riêng, chỉ dọn database/user QA do runner tạo. Transaction/identity QA vẫn tồn tại trên Fabric; không xóa ledger để làm sạch chúng.

Browser automation dùng Playwright 1.65.0 trong cache công cụ, không thêm dependency dự án. Lệnh dưới chạy image Microsoft Playwright, chuyển **chỉ mật khẩu demo** qua môi trường container tạm; không mount .env/private key/Docker socket. Chỉ dùng khi đã chấp nhận cách chạy này:

```bash
npm exec --yes --package=playwright@1.65.0 -c 'NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node scripts/demo-browser.js'
```

Runner dùng form đăng nhập thật cho 13 tài khoản, kiểm tra routes/desktop/mobile/URL trái quyền, bàn giao–tiếp nhận riêng lô 007. Không bật trace/screenshot form mật khẩu; che mật khẩu khỏi lỗi/report.

Service lỗi: mở Docker Desktop, chạy scripts/up.sh để resume. Chỉ restart app khi cần:

```bash
docker compose -f docker-compose.yml -f docker-compose.fabric.yml restart backend frontend
bash scripts/demo.sh check
```

Dừng bằng `bash scripts/stop.sh`. Không dùng down -v, network.sh down, prune volume hoặc reset-demo. Restart backend làm hết phiên đăng nhập RAM, cần đăng nhập lại.

QR camera/in giấy, truy cập từ mạng ngoài, máy sạch và tải lớn: **NOT VERIFIED**. Điện thoại cần PUBLIC_BASE_URL là IP/tên máy truy cập được, không phải localhost; đổi cấu hình riêng rồi recreate backend, không sửa ledger.

## 8. QR điện thoại qua Wi-Fi/LAN

### Cấu hình đang dùng

IP lấy trực tiếp từ Windows Get-NetIPConfiguration, adapter Wi-Fi có gateway thật: **172.16.30.128**, gateway 172.16.30.1. WSL2 đang dùng mirrored networking nên nhìn thấy cùng IP; đây không phải IP Docker bridge. IP có thể thay đổi khi đổi Wi-Fi/DHCP.

| Thành phần | Địa chỉ / cách hoạt động |
| --- | --- |
| Frontend trên máy tính | http://localhost:3001 |
| Frontend cho điện thoại | http://172.16.30.128:3001 |
| QR mẫu / public trace | http://172.16.30.128:3001/trace/TC-DEMO-V1-001 |
| API từ trình duyệt | /api, cùng origin frontend; Vite proxy tới backend:8080 |
| Backend trực tiếp | 127.0.0.1:8080, không cần mở cho điện thoại |
| MySQL trực tiếp | 127.0.0.1:3307, không cần mở cho điện thoại |

Frontend là Vite preview trong Docker, listen 0.0.0.0:3000, publish 3001. Dev script cũng đã listen 0.0.0.0. Không thêm Nginx/tunnel/domain/hosting. Điện thoại không truy cập MySQL, Gateway, peer, orderer hay CA.

Backend lấy PUBLIC_BASE_URL từ file môi trường gốc riêng; giá trị hiện tại đã đặt thành http://172.16.30.128:3001. QR được render theo yêu cầu từ mã lô đã có, không lưu URL vào ledger. Chỉ chấp nhận HTTP(S) origin, không chứa tài khoản/mật khẩu, path/query/fragment; không dùng Host/X-Forwarded-Host do client gửi. PNG trả Cache-Control: no-store.

### Chặn hiện tại trên Windows

**Chưa xác nhận LAN end-to-end/điện thoại thật.** Wi-Fi Windows hiện là **Public**, phiên thực thi không có quyền Windows Administrator. Windows mở http://127.0.0.1:3001 được nhưng gọi IP Wi-Fi:3001 bị timeout; Hyper-V/WSL đang có DefaultInboundAction=Block. HTTP client .NET trên Windows còn timeout với hostname localhost (DNS ưu tiên ::1); dùng IPv4 loopback trên máy tính nếu gặp tình trạng này. Publishing frontend IPv4/IPv6 cũ được giữ nguyên. Không tắt Firewall hoặc đổi mặc định thành Allow để vượt chặn.

Nếu là Wi-Fi dùng chung (trường học/quán/công ty), giữ Public; ưu tiên mạng demo riêng đáng tin cậy. Không tự chuyển mạng dùng chung thành Private chỉ để mở cổng. Nếu là Wi-Fi riêng đáng tin cậy, chọn Private trong Windows Settings → Network & Internet → Wi-Fi → mạng hiện tại, rồi mở **PowerShell as Administrator** và chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "\\wsl.localhost\Ubuntu\home\viet\DoAnBlockchain\scripts\lan.ps1" -Firewall
```

Script không tự đổi network trust, không tắt Firewall, không đặt inbound mặc định thành Allow. Nó chỉ cho TCP 3001 từ LocalSubnet trên profile Private (Windows và Hyper-V/WSL), đồng thời tạo rule chặn cổng nội bộ TraceChain từ LAN trên Private. Không sửa cấu hình Fabric/channel/ledger; rule Firewall cần được chạy và kiểm tra ở quyền Administrator, hiện chưa được áp dụng bởi agent.

Các peer/orderer/CA hiện do mạng Fabric cũ publish cổng trên host; không recreate chúng để sửa networking trong nhiệm vụ QR. Rule Private chặn cổng nội bộ là lớp bảo vệ LAN cần áp dụng khi bật chế độ demo LAN. MySQL/API của ứng dụng đã được bind loopback trong Compose.

### Khi đổi Wi-Fi / IP

Từ WSL, chạy lệnh chỉ đọc để lấy đúng IP Windows mới:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/scripts/lan.ps1")"
```

Lấy dòng PUBLIC_BASE_URL script in ra, sửa **chỉ dòng này** trong file môi trường gốc riêng, không thay credentials. URL chỉ gồm scheme + IP + port 3001, không có /trace hoặc dấu ?/#. Sau đó áp dụng backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --no-deps --wait backend
curl -fsS http://localhost:3001/api/health/dependencies
```

Không cần rebuild frontend vì browser gọi /api cùng origin. Khi chuyển sang mạng Private khác, kiểm tra lại rule Firewall và IP; không mở rule Public. Khởi động lại backend làm hết phiên đăng nhập RAM, cần đăng nhập lại.

### Tạo lại, tải và in QR

Mở chi tiết lô có sẵn trên máy tính, tải lại trang. QR mới dùng PUBLIC_BASE_URL hiện tại; bấm **Tải PNG** hoặc **In QR** như trước. Có thể tải PNG công khai từ:

http://localhost:3001/api/lots/TC-DEMO-V1-001/qr

[PNG QR LAN mẫu](reports/tracechain-lan-qr.png) được lấy từ backend và giải mã độc lập để kiểm tra URL. Khi IP đổi, phải tải/in lại mã; ảnh QR đã in trước đó không tự đổi đích. Không đổi mã lô, lịch sử MySQL hoặc ledger để tạo QR mới.

### Kiểm tra cuối bằng điện thoại thật

1. Điện thoại và máy tính dùng cùng Wi-Fi riêng; không dùng mạng Guest có client isolation. Tạm tắt dữ liệu di động/VPN trên điện thoại để kiểm tra đúng LAN.
2. Trước khi quét, mở http://172.16.30.128:3001/trace/TC-DEMO-V1-001 bằng browser điện thoại. Trang phải hiện Xoài Cát Hòa Lộc, HTX Nông Sản Miền Tây, vùng trồng, trạng thái, 11 sự kiện và IESH hợp lệ, không yêu cầu đăng nhập.
3. Mở QR mới trên máy tính hoặc bản in, quét camera điện thoại. Xác nhận đúng URL LAN, không có localhost/token; kiểm tra timeline không tràn ngang.
4. Thử lô TC-DEMO-V1-022 để thấy cảnh báo thu hồi. Không tạo/ghi sự kiện mới chỉ để thử QR.
5. Nếu timeout: kiểm tra profile Private, rule Windows/Hyper-V cho TCP 3001, cùng subnet/client isolation. Nếu thấy trang nhưng API lỗi: kiểm tra /api/health/dependencies và Vite proxy, không đổi API browser thành localhost:8080.

WSL hiện là mirrored nên không thêm portproxy NAT. Nếu đổi sang NAT trên máy khác, phải chẩn đoán lại IP/forwarding; không chép IP WSL vào QR hoặc mở toàn bộ WSL Firewall.

### Kiểm thử có thể chạy lại

```bash
bash scripts/test.sh
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$PWD/scripts/lan.test.ps1")"
npm exec --yes --package=playwright@1.65.0 --package=jsqr@1.4.0 --package=pngjs@7.0.0 -c 'NODE_PATH="$(dirname "$(dirname "$(command -v playwright)")")" node scripts/lan-browser.js'
```

Browser QA chỉ đọc dữ liệu công khai, không truyền credential vào container, không đăng nhập/seed/ghi CTE. Docker host networking có thể không truy cập được IP Wi-Fi do cách mạng Desktop/WSL được cách ly; khi đó cần kiểm tra bằng browser trên Windows/thiết bị thật, không bỏ qua lỗi hay ép thay URL thành localhost. [Report QR/browser](reports/lan-qr.json) ghi riêng kết quả, không đồng nghĩa đã test camera điện thoại.

Kết quả lượt LAN: backend **28 PASS/32 integration SKIP**, chaincode **10 PASS**, frontend **62 PASS**, typecheck/build PASS; QR/CORS/Host spoofing/config sai/canonical ID/cache có regression. Self-check PowerShell PASS nhưng không áp dụng Firewall. Chromium trực tiếp trên WSL đã mở được cả localhost và IP Wi-Fi ở 390/1440 px, giải mã PNG độc lập đúng URL LAN và tải dữ liệu Fabric thật; anonymous admin bị 401, lô không tồn tại bị 404, lô thu hồi có cảnh báo. Windows IPv4 loopback HTTP 200; client .NET gọi localhost/IP Wi-Fi timeout, điện thoại thật NOT VERIFIED. [Report môi trường](reports/lan-environment.json) ghi rõ các kết quả này.

So fingerprint cả 24 bảng MySQL trước/sau: không đổi. Query lại 24 lô/142 TxID/IESH trên Fabric: không đổi. Regression tạo lô/bàn giao/auth chạy trong bộ nhớ/unit fixtures, không submit giao dịch live chỉ để thử LAN; không chạy seed/migration/reset hoặc chỉnh dữ liệu nghiệp vụ.

Các file đổi cho LAN: backend/server.js, backend/integration.test.js, scripts/test-mysql.js (fixture URL), docker-compose.yml, .env.example, backend/.env.example, scripts/lan.ps1, scripts/lan.test.ps1, scripts/lan-browser.js và hướng dẫn này. File môi trường riêng chỉ đổi PUBLIC_BASE_URL, vẫn bị Git ignore.
