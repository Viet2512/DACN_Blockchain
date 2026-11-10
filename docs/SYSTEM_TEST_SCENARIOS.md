> **Cập nhật 06/11/2026:** Backend đã dùng Fabric v2 cho lô mới, signer riêng và Org3 hoạt động. ISSUE-01/02/07 và các lỗi đã sửa được ghi trong [REMEDIATION_RESULTS.md](./REMEDIATION_RESULTS.md). Mô tả “source hiện lỗi/thiếu” ở kịch bản dưới đây là hiện trạng lúc lập kịch bản; dùng CSV mới để xem kết quả sau sửa. `PARTIAL` nghĩa là đã chạy một phần nhưng chưa đủ toàn bộ thao tác của ca, không tính PASS.

# Kịch bản kiểm thử toàn bộ đồ án TraceChain

Ngày rà soát: 05/11/2026. Đối chiếu [Master Prompt](../FRONTEND_TASK.md), source
Backend/Frontend/chaincode và [kết quả MySQL](./MYSQL_VERIFICATION.md).
Mục tiêu: tìm thiếu sót và lỗi có thể tái hiện, không chỉ diễn lại luồng thành công.

## 1. Kết luận trước khi chạy

**Chưa đủ bằng chứng để kết luận toàn bộ đồ án Blockchain đã đạt.** MySQL/API/UI
đã có kiểm chứng, nhưng Backend chưa dùng Fabric; còn lỗi và khoảng trống dưới đây.

| Mã vấn đề | Ưu tiên | Phân loại và bằng chứng | Ca kiểm thử liên quan |
|---|---|---|---|
| ISSUE-01 | P1 | Đã tái hiện với fixture: ValidateTraceHistory báo FSM sai ngay với lịch sử chỉ có CTE_CREATE hợp lệ. `status` khởi đầu là chuỗi rỗng, nhưng rule CREATE.from là null. Nguồn: [traceability.ts](../chaincode/src/traceability.ts), hàm ValidateTraceHistory. Chưa chạy qua mạng Fabric thật. | FAB-04 |
| ISSUE-02 | P1 | Đã tái hiện phần trạng thái trong RAM: domain tiến trạng thái trước khi saveLot; nếu persistence lỗi thì không có rollback RAM, restoreLot không ghi đè state đang có. Lần ghi tiếp theo dựa trên SQL cũ có thể tiếp tục bị 409. Nguồn: [server.js](../backend/server.js), [domain.js](../backend/domain.js). Chưa bơm lỗi lên DB đang dùng. | OPS-03 |
| ISSUE-03 | P1 | Đã kiểm tra API đang chạy: 13/13 integrityHash legacy không khớp canonical timestamp; 0 brokenLinks; 6/6 chứng từ khớp hash file. Không viết lại dữ liệu. Nguyên nhân đã đối chiếu trong báo cáo MySQL. | DATA-06 |
| ISSUE-04 | P1 nếu nghiệm thu Fabric | Gateway dùng một certificate/signer cấu hình chung; chưa chọn danh tính theo user. Source xác nhận, chưa kiểm thử mạng Fabric thật. | FAB-01, FAB-02 |
| ISSUE-05 | P1, cần tái hiện QA | GetHistory lấy thứ tự composite key eventId/txId, không bảo đảm thứ tự nghiệp vụ; ValidateTraceHistory dùng trực tiếp mảng này. Cần lịch sử có txId không cùng thứ tự phát sinh để kiểm chứng. | FAB-05 |
| ISSUE-06 | P1, cần tái hiện QA | requireAuth kiểm trạng thái user_accounts; chưa kiểm tra lại actor_roles/actor.status/organization.status ở mỗi request. Thu hồi vai trò actor có thể chưa vô hiệu hóa tài khoản đã cấp. Source: [storage.js](../backend/storage.js), listUsers/authenticateUser. | AUTH-08 |
| ISSUE-07 | P2 / khác biệt yêu cầu | Domain và chaincode cho phép RECALL lặp, UI khóa mọi thao tác sau RECALL. Đã tái hiện ở domain trong RAM. Cần chốt có cho phép bổ sung đợt thu hồi hay khóa tuyệt đối; không tự đổi luật chaincode. | REC-02 |
| ISSUE-08 | P2 / thiếu chức năng | ValidateTraceHistory chưa xác minh lại đủ Identity/Event/hash và quan hệ nhận hàng; local validate chỉ kiểm hash/link. Không được quảng bá kết quả là IESH đầy đủ. | FAB-06, FAB-07, GAP-06 |
| ISSUE-09 | P2, cần tái hiện QA | currentHolder local đổi ở mọi event; chaincode chỉ đổi khi RECEIVE_SHIP. Cần đối chiếu nghiệp vụ và hai chế độ trước khi dùng làm thống kê tổ chức sở hữu. | DATA-08 |

P0: nguy cơ mất/lộ dữ liệu hoặc phá ledger. P1: sai nghiệp vụ/quyền/xác minh hoặc
chặn luồng chính. P2: chức năng thiếu/khác biệt cần chốt, UX và vận hành.
Các mục “cần tái hiện QA” là nghi vấn từ source, chưa phải kết quả test runtime.
Lượt này lập kịch bản và kiểm chứng chọn lọc, **không sửa source ứng dụng**.

## 2. Phân tách môi trường

| Môi trường | Được làm | Không được suy ra |
|---|---|---|
| Hệ thống hiện có: UI :3001, API :8080 | Đọc, login/logout bằng tài khoản đã được cấp, xem lô/QR, ghi nhận bằng chứng | GET 200 không có nghĩa lịch sử hợp lệ; không dùng ba lô hiện có để test ghi/thu hồi |
| QA MySQL riêng, FABRIC_ENABLED=false | Tạo user/actor/lô QA; mutation, rollback, sửa fixture, lỗi mạng và tải thử | UUID/event local không phải txId đã commit Fabric |
| QA Fabric + MySQL riêng | Certificate thật từng role, submit/endorse/commit, ledger history và đối soát SQL | Chỉ bật FABRIC_ENABLED không chứng minh network hoạt động |

Các ca có ghi, sửa file, sửa SQL, dừng dịch vụ hoặc đổi chứng thư **chỉ chạy QA**.
Không seed/reset database đang dùng, không xóa volume hoặc khởi động network.sh
trên mạng Fabric cần giữ. Đặc biệt không thử phương án rollback bằng image Backend
cũ lên DB active vì bản cũ có startup tự tính lại hash.

### Chạy kiểm thử tự động có sẵn

Từ thư mục gốc, dependency đã cài và Docker đang hoạt động:

```bash
# Unit/component/integration fixture + typecheck + production build
bash scripts/test.sh

# API + SQL + transaction thật, chỉ trong DB/user MySQL tạm riêng
node scripts/test-mysql.js

# Hệ thống đang chạy: login/25 GET/logout, không ghi nghiệp vụ
node backend/check-api.js
```

Lệnh cuối đọc ADMIN_USERNAME/ADMIN_PASSWORD hiện có từ .env; không reset mật khẩu
nếu login thất bại. Runner MySQL tạo rồi dọn DB/user riêng có tên ngẫu nhiên;
không chạy thủ công file mysql.integration.test.js với tên database production.

Kết quả lần trước: 33 ca mặc định đạt + 2 ca MySQL riêng đạt, tổng 35 ca riêng
biệt. **Không phải 35 ca bao phủ mọi dòng kịch bản bên dưới.** Lượt rà soát này
chạy lại bộ API chỉ đọc: 25 GET thành công, vẫn có 13 hash legacy cần đối soát.
Không chạy lại toàn bộ 35 ca trong lượt viết kịch bản này.

### Chuẩn bị QA thủ công

1. Tạo database MySQL và user QA riêng, quyền chỉ vào database đó; khởi tạo bằng
   [schema.sql](../backend/schema.sql). Không import schema vào database active.
2. Dùng Backend QA cổng 18080; MYSQL_DATABASE/USER/PASSWORD trỏ đúng QA,
   MYSQL_HOST=127.0.0.1, MYSQL_PORT=3307 khi dùng MySQL Docker từ host.
   Đặt FABRIC_ENABLED=false. ADMIN_USERNAME/ADMIN_PASSWORD QA chỉ bootstrap khi
   bảng tài khoản QA rỗng. Giữ mật khẩu trong env, không điền vào CSV.
3. Chạy Frontend QA cổng 13001 với VITE_API_URL=http://localhost:18080/api.
   PUBLIC_BASE_URL Backend QA phải trỏ cổng 13001, dùng IP LAN khi test điện thoại.
4. Với môi trường QA đã được cấu hình ở terminal, lệnh chạy là:

```bash
# Terminal Backend: các biến MYSQL_*, ADMIN_* phải đã trỏ QA, không kế thừa DB active.
PORT=18080 FABRIC_ENABLED=false npm --prefix backend start

# Terminal Frontend
PORT=13001 VITE_API_URL=http://localhost:18080/api npm --prefix frontend start -- --strictPort
```

5. Trước mutation đầu tiên, kiểm tra tên DB từ cấu hình tiến trình và
   `SELECT DATABASE()` bằng kết nối của QA. Không chỉ dựa vào nhãn giao diện.
6. Tạo actor rồi user bằng Admin QA tại /admin/actors và /admin/users.
   Các actor dưới đây là fixture ứng dụng local; khi sang Fabric cần certificate
   có attribute thật, không coi chuỗi x509 nhập trong form là certificate đã cấp.

| Ký hiệu | Role | MSP | Region | Mục đích |
|---|---|---|---|---|
| A | ADMIN | Không ký nghiệp vụ | — | Quản trị QA |
| F1 | FARMER | Org1MSP | QA-A | Sản xuất hợp lệ |
| F2 | FARMER | Org1MSP | QA-B | Kiểm tra cách ly vùng |
| P1 | PROCESSOR | Org1MSP | QA-A | Sơ chế, bàn giao |
| T1 | TRANSPORTER | Org2MSP | QA-A | Nhận cùng vùng |
| T2 | TRANSPORTER | Org2MSP | QA-B | Nhận khác vùng được chỉ định |
| T3 | TRANSPORTER | Org2MSP | QA-A | Cùng MSP/vùng nhưng khác cá nhân |
| D1 | DISTRIBUTOR | Org3MSP | QA-A | Phân phối hợp lệ |
| D2 | DISTRIBUTOR | Org3MSP | QA-B | Phân phối sau nhận khác vùng |

Mỗi lần test đặt RUN=<ngày-giờ hoặc UUID>. Dùng mã QA-RUN-FLOW, QA-RUN-RECALL,
QA-RUN-HANDOVER, QA-RUN-FAIL. Tạo lô riêng cho ca phá dữ liệu/thu hồi; không tái
sử dụng lô đã tiến trạng thái làm điều kiện đầu vào cho ca trạng thái trước.

## 3. Quy tắc ghi nhận kết quả

Dùng [SYSTEM_TEST_RESULTS.csv](./SYSTEM_TEST_RESULTS.csv) để điền thực tế.
Mỗi dòng: người chạy, thời gian, mode, bước/request, status/body đã che bí mật,
lotId/eventId/txId (nếu thật sự có), trạng thái trước/sau, delta số sự kiện,
kết quả UI và đường dẫn bằng chứng. Không lưu token/password/private key.

- PASS: đã chạy đúng môi trường, kết quả khớp, có bằng chứng.
- FAIL: đã chạy và sai; ghi bước tái hiện cụ thể.
- FAIL_FIXTURE: đã tái hiện với fixture trong bộ nhớ, chưa phải test mạng thật.
- KNOWN_ISSUE: vấn đề đã xác nhận ở dữ liệu/source cần xử lý, không đánh dấu đạt.
- BLOCKED: không có hạ tầng/identity/API để chạy.
- GAP: yêu cầu chưa có chức năng/API hoặc còn cần chốt nghiệp vụ.
- NOT_RUN: chưa chạy, kể cả khi ca gần giống đã nằm trong một test tự động khác.

Mọi mutation thất bại: so sánh SQL và ledger nếu có; không chỉ kiểm HTTP. Kết quả
5xx/timeout có thể là commit đã xảy ra, phải đọc lại trước khi gửi tiếp.

## 4. Kịch bản chạy nhanh 30–45 phút

1. BASE-01..03: Docker/MySQL/API. Chạy ba lệnh tự động ở mục 2 khi có quyền QA.
2. AUTH-01..05: login các role, refresh, thử route và API khác quyền.
3. FLOW-01..07: lô mới đi hết chuỗi 7 sự kiện.
4. HAND-02..04 và FLOW-08..10: sai vùng/role/previousEvent phải bị từ chối.
5. DOC-01..03, PUB-01..03: chứng từ, QR và dữ liệu công khai.
6. REC-01..03: thu hồi lô riêng, public cảnh báo, không đi tiếp FSM.
7. ADM-01..03 và UI-01..03: user, khóa phiên, bảng, mobile.
8. Trước nghiệm thu Blockchain phải chạy thêm FAB-01..10; không bỏ qua vì demo
   MySQL đã hoạt động. Lỗi ISSUE-01/02/03 phải có xử lý hoặc giới hạn được ghi rõ.

## 5. Các ca kiểm thử chi tiết

Cột môi trường: LIVE=chỉ đọc hệ thống hiện có; QA=MySQL QA riêng;
FAB=Fabric QA + MySQL QA; RAM=fixture trong bộ nhớ. Có 101 mã ca. Mỗi dòng là một ca hoặc một
ca tham số hóa theo danh sách giá trị nêu trong bước.

### A. Hạ tầng và bảo toàn dữ liệu

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| BASE-01 | P1 | LIVE | docker compose ps; kiểm Backend/Frontend/MySQL | Dịch vụ Up; MySQL healthy; không thay đổi container dự án khác |
| BASE-02 | P1 | LIVE | GET /api/health; mở /login | API phản hồi, mysql enabled; fabric được ghi đúng cấu hình; không nhầm cấu hình với readiness |
| BASE-03 | P1 | LIVE | node backend/check-api.js | Login/25 GET/logout hoàn tất; contract đúng; ghi riêng kết quả valid/hash, không coi 200 là dữ liệu hợp lệ |
| BASE-04 | P0 | QA | Backup SQL và uploads, restore sang DB/thư mục mới; so fingerprint | Khôi phục đủ dữ liệu và tài liệu, đúng ID/hash/FK; không import đè DB đang dùng |
| BASE-05 | P1 | QA | Khởi động thiếu MYSQL_PASSWORD hoặc sai host/port | Báo lỗi cấu hình/kết nối; không âm thầm chạy như đã dùng MySQL hay tạo dữ liệu local thay thế |

### B. Authentication, RBAC và phạm vi

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| AUTH-01 | P1 | QA | Login A,F1,P1,T1,D1; F5 mỗi tài khoản | Đúng dashboard/role/MSP/vùng từ /auth/me; không đọc role từ localStorage |
| AUTH-02 | P1 | QA | Sai mật khẩu, user không tồn tại, thiếu trường, chuỗi rỗng | Từ chối có thông báo; không cấp token; UI không báo thành công |
| AUTH-03 | P1 | QA | Logout rồi gọi /auth/me với token cũ; xóa sessionStorage và vào /lots | Token cũ 401; UI chuyển login; không còn dữ liệu cache của người trước |
| AUTH-04 | P1 | QA | F1 mở /admin/users và gọi GET /users trực tiếp; thử POST /actors | Route bị chặn; API 403; ẩn sidebar không phải lớp bảo vệ duy nhất |
| AUTH-05 | P1 | QA | F1 gọi PROCESS; P1 gọi CREATE/HARVEST; A gọi mọi POST nghiệp vụ | Sai role 403; không tăng eventCount, không đổi SQL/ledger |
| AUTH-06 | P1 | QA | F2 thử detail/history/validate/documents/download/upload/recall của lô QA-A | Tất cả đường trái phạm vi bị từ chối; không rò dữ liệu qua endpoint phụ |
| AUTH-07 | P1 | QA | A khóa tài khoản đang login; dùng lại token; mở khóa và login mới | Request tiếp theo 401; phiên cũ không sống lại; login mới theo trạng thái hiện tại |
| AUTH-08 | P1 | QA | A bỏ FARMER khỏi actor F1; thử token cũ và login lại; lặp với actor/org inactive bằng fixture | Quyền bị thu hồi nhất quán; không chỉ kiểm user_accounts.status. Nếu vẫn ghi được, ghi ISSUE-06 |
| AUTH-09 | P1 | QA | Sửa body actorId/actorRole/orgMsp/actorRegion, sửa cached role thành ADMIN | Backend lấy danh tính từ phiên/certificate; không ghi dưới tác nhân giả |
| AUTH-10 | P2 | QA | Restart riêng Backend QA; thử token cũ; kiểm nhiều lần login sai theo ngưỡng đã thống nhất | Phiên RAM cũ bị từ chối; UI xử lý 401. Ghi GAP nếu chưa có TTL/rate limit theo yêu cầu vận hành |

### C. Luồng nghiệp vụ chuẩn và FSM

Tại mọi bước thành công: HTTP 201, lastEventId mới, +1 sự kiện, previousEventId
trỏ đúng event trước, UI refetch dữ liệu; SQL đúng sau mở lại trang.

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| FLOW-01 | P1 | QA | F1 tạo QA-RUN-FLOW với tên Xoài QA, origin, harvestDate YYYY-MM-DD, location, region QA-A | CREATED; 1 CTE_CREATE; không tự coi đã thu hoạch |
| FLOW-02 | P1 | QA | F1 mở lô CREATED, ghi CTE_HARVEST và KDE hợp lệ | HARVESTED; 2 sự kiện |
| FLOW-03 | P1 | QA | P1 mở HARVESTED, ghi CTE_PROCESS | PROCESSED; 3 sự kiện; F1 không được gọi PROCESS |
| FLOW-04 | P1 | QA | P1 chọn T1 và tạo handover request | WAITING_SHIP; 4 sự kiện; pendingTo Org2MSP, pendingToRegion QA-A |
| FLOW-05 | P1 | QA | T1 đối chiếu và confirm | IN_TRANSIT; 5 sự kiện; pending trống; currentHolder đúng bên nhận |
| FLOW-06 | P1 | QA | D1 ghi CTE_DISPATCH_RETAIL từ IN_TRANSIT | IN_RETAIL; 6 sự kiện; không tự thêm bước nhận phân phối không có trong source |
| FLOW-07 | P1 | QA | D1 ghi CTE_DISPLAY_SALE | READY_FOR_SALE; 7 sự kiện; public hiện trạng thái đúng |
| FLOW-08 | P1 | QA | Tạo lô riêng rồi gọi PROCESS/DISPLAY_SALE trước HARVEST | Bị từ chối trạng thái, thường 409; số sự kiện và trạng thái không đổi |
| FLOW-09 | P1 | QA | Gửi previousEventId cũ/sai/bỏ trống cho event sau CREATE | Bị từ chối; không tạo nhánh hoặc bỏ qua liên kết |
| FLOW-10 | P1 | QA | Gửi cùng eventType/payload/previousEventId hai lần, lần lượt và đồng thời | Chỉ một lần tiến trạng thái; lần còn lại conflict; UI tránh double-submit |

### D. Bàn giao hai bước

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| HAND-01 | P1 | QA | P1 request rồi xem bằng P1/T1/Admin trước confirm | Chưa chuyển trách nhiệm như đã nhận; các trang dùng cùng dữ liệu pending |
| HAND-02 | P1 | QA | T2 vùng QA-B confirm yêu cầu dành QA-A | 403; WAITING_SHIP giữ nguyên |
| HAND-03 | P1 | QA | D1 hoặc F1 gọi confirm trực tiếp | 403 sai role/MSP; không tăng số sự kiện |
| HAND-04 | P1 | QA | Request chỉ định T2 QA-B, T2 list/detail/confirm, rồi D2 phân phối | Bên nhận khác vùng thấy đúng lô được chỉ định; sau nhận region QA-B; người QA-A không còn đọc theo chính sách vùng |
| HAND-05 | P2 | QA | T3 cùng MSP/vùng với T1 confirm yêu cầu “chọn T1” | Ghi nhận hiện chỉ ràng buộc MSP/vùng. Nếu mong chỉ cá nhân T1 được nhận thì GAP, không báo UI chọn tên là phân công cá nhân |
| HAND-06 | P1 | QA | Gọi request trực tiếp với thiếu toOrg/toRegion, MSP không tồn tại, vùng chỉ có khoảng trắng | Dữ liệu sai bị chặn, không đẩy lô vào trạng thái chờ bên nhận không tồn tại; nếu nhận được MSP giả thì ghi lỗi validation |
| HAND-07 | P1 | QA | Confirm khi chưa request, confirm sau recall, confirm lần hai | Sai FSM bị từ chối; không chuyển holder/vùng lần nữa |
| HAND-08 | P2 | QA | Tìm thao tác cancel/reject và API tương ứng | Nếu chưa có API, ghi GAP; không có nút giả, không tự đổi trạng thái Blockchain |

### E. Thu hồi

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| REC-01 | P1 | QA | Tạo lô riêng tại từng trạng thái; actor nghiệp vụ cùng vùng ghi RECALL | RECALLED và giữ lịch sử trước đó; Admin không ký thay |
| REC-02 | P2 | RAM/QA | RECALL rồi gửi tiếp RECALL qua API trực tiếp | Theo yêu cầu khóa tuyệt đối phải bị chặn; source hiện cho phép. Ghi khác biệt ISSUE-07 để chốt, không giả rằng UI đã bảo vệ API |
| REC-03 | P1 | QA | Sau recall thử HARVEST/PROCESS/HANDOVER/CONFIRM/DISPATCH/DISPLAY | Tất cả bước thường bị chặn; không xóa/lùi lịch sử |
| REC-04 | P1 | QA | Consumer quét QR lô recalled; Admin xem lịch sử thu hồi | Cảnh báo rõ và nhìn thấy trên mobile; lý do nội bộ không bị lộ qua public data |

### F. Dữ liệu đầu vào, MySQL và tính toàn vẹn

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| DATA-01 | P1 | QA | Tạo lot trùng ID; thử khác chữ hoa/thường và khoảng trắng | Không ghi đè lô/historic event; chính sách collation và trim nhất quán, lỗi trùng được trình bày rõ |
| DATA-02 | P1 | QA | Thiếu/null/sai kiểu/whitespace lotId, productName, origin, location; JSON sai | 4xx có kiểm soát; không 500 do TypeError; không lưu hàng dở dang |
| DATA-03 | P1 | QA | Ngày 2026-02-30, ngày sai format; timestamp invalid và timestamp ngược thời gian | Ngày/timestamp sai bị từ chối, hoặc timestamp do server cấp; không tạo lịch sử lệch thứ tự |
| DATA-04 | P2 | QA | Tên có dấu/emoji, dữ liệu tối đa và vượt chiều dài; quantity 0/âm/rất lớn nếu UI có KDE | UTF-8 đúng, form/API không âm thầm cắt dữ liệu; KDE được validate theo contract đã chốt |
| DATA-05 | P1 | QA | Ghi event mới rồi đọc lại, restart storage/Backend QA, đối chiếu timestamp và hash | DATE không lệch ngày, millisecond không mất, ID/hash không tự thay đổi, lịch sử mới vẫn hợp lệ |
| DATA-06 | P1 | LIVE chỉ đọc | Validate ba lô đang có và phân biệt documentHash/integrityHash | Ghi nhận 13 hash legacy cần đối soát, không tự sửa để đạt; chứng từ khớp không chứng minh cả lịch sử hợp lệ |
| DATA-07 | P1 | QA | FK sai, actor roles trùng, lỗi NOT NULL trong saveLot; so trước/sau | Transaction rollback toàn bộ; không bỏ lỗi bằng INSERT IGNORE; không để lot không đủ event |
| DATA-08 | P2 | QA/FAB | Cùng chuỗi CTE ở hai mode; đối chiếu currentHolder sau mỗi bước | Theo chính sách đã chốt, không dùng kết quả local để khẳng định holder Fabric; ghi ISSUE-09 nếu khác |
| DATA-09 | P1 | QA | Hai event có timestamp bằng nhau hoặc backdated; đọc lịch sử nhiều lần | Thứ tự dựa trên quan hệ trước/sau nhất quán; không chỉ may mắn nhờ thứ tự SQL |
| DATA-10 | P1 | QA | Gửi SQL-like input; thử ghi thay hash event cũ; XSS string trong product/note | Query tham số hóa, SQL không đổi nghĩa; hash cũ không bị ghi đè; React render text, không thực thi script |

### G. Chứng từ

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| DOC-01 | P1 | QA | Upload PDF/ảnh dưới 5 MiB, gửi documentHash trong event, tải lại bằng API có quyền | File lưu đúng, gắn đúng lot/event, byte tải về khớp, hash thực tế khớp hash sự kiện |
| DOC-02 | P1 | QA | File vượt 5 MiB, file rỗng, đuôi PDF nhưng nội dung khác, MIME giả | Giới hạn và chính sách loại file được kiểm ở Backend; lỗi rõ, không coi accept của input là validation bảo mật |
| DOC-03 | P1 | QA | Người ngoài vùng download theo documentId đoán được; truy cập /uploads cũ | Bị từ chối/không công khai; không leak file hoặc path nội bộ |
| DOC-04 | P1 | QA | Trên fixture riêng, thay byte file sau upload rồi verify | valid false; không tính lại hash rồi ghi đè chứng cứ gốc |
| DOC-05 | P2 | QA | Upload rồi đóng form; verify khi file chưa gắn; lô không có file | Không báo tất cả chứng từ hợp lệ; không file trả valid null; ghi GAP cleanup file mồ côi nếu chưa có |
| DOC-06 | P1 | QA | Gắn cùng fileHash cho lô khác hoặc event không được phép | Kiểm tra phạm vi/quan hệ; không công nhận file thuộc lô A là chứng từ lô B nếu chưa có quan hệ hợp lệ |
| DOC-07 | P1 | QA | Gắn file qua handover/confirm/recall, không chỉ /events; lặp upload cùng nội dung | Đường ghi nhất quán; không gắn nhầm event; nếu file trùng tạo nhiều metadata phải ghi rõ chính sách |

### H. Consumer và QR

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| PUB-01 | P1 | QA | Mở /trace và /trace/:lotId trong cửa sổ ẩn danh | Không cần login; hiển thị đúng lot, trạng thái, timeline và nguồn dữ liệu |
| PUB-02 | P1 | QA | Xem raw JSON public; trong note fixture đặt contact/giá/hợp đồng/private marker | Không có actorId, data tùy ý, tài liệu nội bộ, token/private key hoặc marker riêng tư |
| PUB-03 | P1 | QA | Lot không tồn tại, ID encode/ký tự lạ, API offline | Phân biệt lỗi và không tìm thấy; có tải lại; không giữ hồ sơ lô trước như hồ sơ lô mới |
| PUB-04 | P1 | QA | valid true/false/null và HTTP 200 không có kết quả xác minh | Chỉ dùng boolean/phạm vi thật; null/thiếu dữ liệu không được hiển thị “Blockchain đã xác minh” |
| PUB-05 | P2 | QA | Tải PNG, in QR, giải mã bằng điện thoại thật | Nội dung đúng URL/lotId; không trỏ localhost của điện thoại; bản in có mã lô đọc được |
| PUB-06 | P1 | QA | Xem lô CREATED/WAITING_SHIP/READY_FOR_SALE/RECALLED | Phân biệt chưa hoàn tất, sẵn sàng bán và cảnh báo thu hồi; không dùng chung thông báo thành công |
| PUB-07 | P2 | QA | URL chứa dấu, khoảng trắng, slash được encode; chuyển nhanh giữa hai lotId | URL encode đúng; không lẫn cache/timeline; QR và truy xuất trỏ cùng một lô |

### I. Admin và dữ liệu thống kê

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| ADM-01 | P1 | QA | Tạo actor rồi user; chọn role/MSP/vùng phù hợp; actor không thuộc MSP | Quan hệ hợp lệ mới được tạo; không phát certificate Fabric giả từ form actor |
| ADM-02 | P1 | QA | Tạo username trùng; cập nhật user; reset password | Không âm thầm ghi đè ngoài xác nhận. UI nêu POST update/reset kích hoạt account và đổi mật khẩu; phiên cũ bị thu hồi |
| ADM-03 | P1 | QA | Tự khóa tài khoản A; khóa/mở user khác; thử tài khoản khóa | Không tự khóa phiên Admin đang dùng qua UI/endpoint; user khóa không login/ghi được |
| ADM-04 | P1 | QA | Đổi actor.role/MSP/vùng sau khi có user và có lịch sử | Quyền phiên, liên kết account và lịch sử nhất quán; không sửa danh tính event cũ như thể chưa từng xảy ra |
| ADM-05 | P2 | QA | Đối chiếu dashboard với GET /lots, /users, /organizations và eventCount | Tổng theo đúng phạm vi/API; 0 không thay cho dữ liệu chưa tải; không hardcode TPS hoặc số tx thất bại |
| ADM-06 | P2 | QA | Xem bảng organization/roles/events/handovers/recalls và detail | Mọi link/action làm việc thật; field không có được ghi chưa cung cấp, không bịa MSP/txId |
| ADM-07 | P2 | QA | Tạo/sửa/khóa/reset user; xem audit log và dữ liệu thiếu/sai | Log đủ hành động mà BE hỗ trợ, không lộ password; ghi GAP nếu chưa audit đủ actor/event/failure. Audit tối đa 500 không phải toàn lịch sử |
| ADM-08 | P2 | QA | Xuất report JSON rồi so số lot/status/event với API cùng thời điểm | JSON tải được, UTF-8 đúng; số liệu hợp lệ, không coi report là bằng chứng ledger độc lập |

### J. Fabric thật, IESH và đối soát

Điều kiện: network QA riêng, IESH bật, certificate có role/region đúng, Gateway
chọn đúng identity và MySQL QA riêng. Chưa đáp ứng thì ghi BLOCKED, không lấy kết
quả local hoặc chaincode unit test thay bằng chứng commit.

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| FAB-01 | P1 | FAB | Kiểm channel, chaincode, peer/TLS; QueryLot/GetHistory qua Gateway đúng tên | Kết nối thật và query được; health enabled không đủ để PASS |
| FAB-02 | P1 | FAB | Login bốn role, đối chiếu certificate thực sự ký từng CTE; thử một cert FARMER cho PROCESSOR | ActorOrg/role/region trên ledger đúng phiên được cấp; sai role/cert bị từ chối; không dùng signer chung ký thay |
| FAB-03 | P1 | FAB | Chạy FLOW-01..07, lưu txId/commit validation code và SQL projection | Commit VALID từng bước rồi SQL mới phản ánh thành công; eventId thật khớp transaction, local UUID không được thay thế |
| FAB-04 | P1 | RAM/FAB | Tạo lịch sử hợp lệ chỉ gồm CTE_CREATE, gọi ValidateTraceHistory; sau đó chuỗi đủ 7 bước | valid true khi không có anomaly. Fixture hiện tái hiện false/FSM do null khác chuỗi rỗng, ghi ISSUE-01 |
| FAB-05 | P1 | FAB | Có CREATE txId lexicographically sau HARVEST txId; đọc GetHistory và validate | Kết quả đúng theo liên kết/thời gian nghiệp vụ, không phụ thuộc sort txId |
| FAB-06 | P1 | FAB | Sai certificate/MSP/role/region, thiếu role; Admin ký CTE | Chaincode từ chối Identity; không tạo event/đổi state. Không chỉ kiểm UI |
| FAB-07 | P1 | FAB | CTE lạ, KDE thiếu, sai FSM/previousEvent/bên nhận/hash chứng từ; gọi kiểm lịch sử | Mỗi vi phạm có kết quả đúng theo phạm vi. Nếu API không kiểm một nhóm, ghi GAP, không cho “IESH đầy đủ” PASS |
| FAB-08 | P1 | FAB | Bơm lỗi ghi MySQL sau khi ledger commit thành công | Ledger không bị ghi lại/xóa; FE báo chưa rõ kết quả; có cách đồng bộ projection một lần từ txId/eventId đã commit |
| FAB-09 | P1 | FAB | Hai giao dịch cùng previousEventId submit đồng thời | Không có hai nhánh ledger hợp lệ; giao dịch conflict có validation code; SQL không ghi transaction bị loại |
| FAB-10 | P0 | FAB | Trên network QA, sửa off-chain metadata/file; so tx/hash với ledger gốc rồi restart services | Phát hiện sai lệch; không sửa ledger/hash gốc để che lỗi; history và provenance còn nguyên sau restart |

### K. Lỗi hệ thống, recovery và đồng thời

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| OPS-01 | P1 | QA | Mất mạng trước gửi, sau gửi nhưng trước nhận response; đọc lại history | Không tự retry POST; không báo committed thiếu bằng chứng; đối chiếu trước lần gửi tiếp |
| OPS-02 | P1 | QA | Hai tab mở cùng lot; tab A ghi xong, tab B dùng previousEvent cũ | Tab B bị conflict và có đường tải lại, không ghi đè state của A |
| OPS-03 | P1 | RAM/QA | Bơm lỗi saveLot sau domain.recordEvent; bỏ lỗi rồi gửi lại dựa trên SQL | SQL và RAM phải hồi phục nhất quán. Fixture hiện giữ RAM ở bước đã tiến, ghi ISSUE-02; chưa coi fixture là fault-injection DB thật |
| OPS-04 | P1 | QA | Mất MySQL tạm thời, phục hồi, sau đó read/write lô QA | Không tạo kho local thành bản thay thế SQL; không mất pool/kẹt phiên vô hạn; không tự đổi hash |
| OPS-05 | P1 | QA | Restart Backend QA sau mỗi bước vòng đời, đọc rồi làm bước kế tiếp | Dữ liệu còn đúng, lô và pending phục dựng được; user đăng nhập lại vì session RAM |
| OPS-06 | P1 | QA | Hai instance Backend QA cùng database, cùng lot; ghi từ hai instance | Không lost update/nhánh history; nếu thiếu khóa/version SQL thì ghi lỗi, không suy ra an toàn từ một instance |
| OPS-07 | P1 | QA | Ghi SQL thành công nhưng attachDocumentsToEvent/audit lỗi hoặc client nhận 5xx | Thông báo kết quả chưa rõ, history đọc được; không append lại event chỉ để gắn chứng từ/audit |
| OPS-08 | P0 | QA | Backup SQL + uploads rồi phục hồi instance QA mới; so ID/hash/file và cấu hình image | Khôi phục nhất quán, secret không trong image; không dùng down -v hoặc sửa volume production |

### L. UI, accessibility và hiệu năng

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| UI-01 | P2 | QA | Desktop 1440, tablet 768, mobile 390; cả sidebar/table/detail/modal/public | Không tràn trang; bảng có scroll riêng; action/label quan trọng dùng được |
| UI-02 | P2 | QA | Tìm kiếm, status/vùng/ngày, sort, trang trước/sau; đổi filter khi ở trang cuối | Kết quả và page count đúng; không mất bản ghi/đứng ở trang rỗng ngoài phạm vi |
| UI-03 | P1 | QA | Slow network, empty result, 401/403/404/409/500, malformed response | Loading/error/empty rõ, không nhầm dữ liệu cũ là kết quả mới; ErrorBoundary hoạt động |
| UI-04 | P2 | QA | Tab/Shift+Tab/Enter/ESC, mở/đóng modal và mobile menu; kiểm focus sau đóng | Label đủ, focus thấy được, dialog không thoát focus ra nền; ESC không đóng khi mutation đang pending; khi chưa rõ kết quả phải đối chiếu trước khi gửi lại |
| UI-05 | P1 | QA | Submit nhanh nhiều lần, Enter liên tục, đóng modal trong lúc ghi/upload | Chỉ một mutation được xử lý; không bỏ thông báo hoặc cho gửi trùng khi đang pending |
| UI-06 | P2 | QA | Chrome/Firefox/Safari và điện thoại; in/tải file | Không chỉ dựa vào jsdom để kết luận dialog/QR/download tương thích |
| UI-07 | P2 | QA | Dataset 0,1,10,11 và số lượng theo quy mô đã chốt; mở history/Admin report | Pagination chuẩn; N+1 request được quan sát; không coi client pagination là server pagination |
| UI-08 | P2 | QA | Chốt tải concurrent và ngưỡng latency trước test; đo HTTP và Fabric riêng | Ghi p50/p95/p99, error rate, thời gian đo. HTTP req/s không phải Fabric committed TPS; Rdetect chỉ tính từ tập vi phạm có nhãn và mẫu số rõ |

### M. Chức năng còn thiếu so với Master Prompt

Đây là kiểm tra phạm vi, không gọi endpoint tưởng tượng rồi kết luận Backend lỗi.
Xem contract đề xuất tại [API_INTEGRATION](./API_INTEGRATION.md).

| ID | Ưu tiên | Môi trường | Thao tác | Kết quả mong đợi |
|---|---|---|---|---|
| GAP-01 | P2 | QA | Kiểm nhật ký canh tác, chất lượng và incident | Chỉ có chức năng thật khi có API; hiện ghi GAP cần Backend, không dùng CTE giả |
| GAP-02 | P2 | QA | Kiểm nhật ký nhiệt độ/độ ẩm/lộ trình vận chuyển | Phân biệt off-chain với on-chain; hiện thiếu API thì ghi GAP |
| GAP-03 | P2 | QA | Kiểm tự đổi mật khẩu, TTL/refresh session, RBAC động | Ghi rõ phần hỗ trợ/không hỗ trợ; không tạo nút không có hành động |
| GAP-04 | P2 | QA | Kiểm CRUD tổ chức và cấp certificate/Fabric onboarding | Không coi POST actor là thêm MSP/cấp cert; quy trình mạng thật chưa có phải ghi GAP |
| GAP-05 | P2 | QA | Kiểm cancel/reject handover, phân công cá nhân, metrics, server pagination | Ghi GAP theo từng nghiệp vụ; chốt phần nào thuộc nghiệm thu, phần nào ngoài phạm vi |
| GAP-06 | P1 | FAB | Kiểm sáu nhóm identity,event,state,handover,previousEvent,hash và trạng thái transaction | Nếu chỉ có hash/link hoặc FSM/link thì chưa đủ IESH đầy đủ; cần API/kết quả bổ sung có bằng chứng |

## 6. Payload và cách thao tác API khi kiểm thử

Dùng Postman/Insomnia với biến môi trường QA: baseUrl, tokenA/tokenF1/tokenP1/
tokenT1/tokenD1, lotId và lastEventId. Token lấy từ login thật và lưu local,
không export credential vào bộ kết quả. Mỗi lần ghi xong cập nhật lastEventId
bằng GET detail trước khi làm bước tiếp theo, trừ ca cố ý gửi sai/đua đồng thời.

```http
POST {{baseUrl}}/auth/login
Content-Type: application/json

{"username":"<username-QA>","password":"<mật-khẩu-QA>"}
```

```http
POST {{baseUrl}}/lots
Authorization: Bearer {{tokenF1}}
Content-Type: application/json

{"lotId":"QA-RUN-FLOW","productName":"Xoài QA 🌱","origin":"Vùng QA","harvestDate":"2026-11-05","location":"Nông trại QA","regionCode":"QA-A"}
```

```http
POST {{baseUrl}}/lots/{{lotId}}/events
Authorization: Bearer {{tokenF1}}
Content-Type: application/json

{"eventType":"CTE_HARVEST","location":"Nông trại QA","previousEventId":"{{lastEventId}}","data":{"note":"Thu hoạch kiểm thử","quantity":100,"unit":"kg"}}
```

```http
POST {{baseUrl}}/lots/{{lotId}}/handover/request
Authorization: Bearer {{tokenP1}}
Content-Type: application/json

{"location":"Kho QA","previousEventId":"{{lastEventId}}","toOrg":"Org2MSP","toRegion":"QA-A","data":{"toOrg":"Org2MSP","toRegion":"QA-A"}}
```

Cần cả toOrg/toRegion cấp đầu và trong data để đúng hai nhánh Gateway/local.
Confirm dùng POST /lots/:id/handover/confirm với location,previousEventId,data.
RECALL dùng POST /lots/:id/recall với location,previousEventId,data.note.
DISPATCH_RETAIL/DISPLAY_SALE dùng /events và token Distributor.

Các câu SQL chỉ đọc để đối chiếu, chỉ hiển thị dữ liệu QA hoặc ID cần thiết:

```sql
SELECT DATABASE(), VERSION(), @@character_set_database;
SELECT lot_id, status, current_holder, region_code, last_event_id
FROM lots WHERE lot_id = 'QA-RUN-FLOW';
SELECT event_id, event_type, actor_role, actor_region, previous_event_id,
       data_hash, integrity_hash, event_timestamp
FROM trace_events WHERE lot_id = 'QA-RUN-FLOW'
ORDER BY event_timestamp, created_at;
SELECT event_id, file_hash FROM event_documents WHERE lot_id = 'QA-RUN-FLOW';
```

Với mutation thành công kiểm +1 event và link đúng; với mutation bị từ chối kiểm
0 thay đổi. Với 5xx/timeout không giả định 0 thay đổi: phải phân loại fail-before-
commit hoặc commit-success-response-lost bằng bằng chứng đọc lại SQL/ledger.

## 7. Tái hiện có kiểm soát hai vấn đề mới

### ISSUE-01: verifier chaincode từ chối CREATE hợp lệ

Sau khi build chaincode, từ root chạy đoạn sau trong tiến trình riêng. Chỉ dùng
fixture, không gọi peer hoặc sửa ledger:

```bash
node <<'NODE'
const assert = require('node:assert/strict');
const {TraceabilityContract} = require('./chaincode/dist/traceability');
(async () => {
  const c = new TraceabilityContract();
  c.QueryLot = async () => JSON.stringify({status:'CREATED', lastEventId:'e1'});
  c.GetHistory = async () => JSON.stringify([
    {eventId:'e1', eventType:'CTE_CREATE', previousEventId:'', toOrg:''}
  ]);
  const result = JSON.parse(await c.ValidateTraceHistory({}, 'QA-PROBE'));
  console.log(result);
  // Assert xác nhận lỗi hiện tại được tái hiện, không phải assert nghiệp vụ đúng.
  assert.equal(result.valid, false);
  assert.ok(result.anomalies.some(a => a.code === 'FSM'));
})().catch(error => {console.error(error); process.exitCode = 1;});
NODE
```

Kết quả nghiệp vụ mong muốn cho fixture này là valid true. Khi sửa lỗi, đoạn
assert tái hiện lỗi phải được thay bằng regression test assert valid true.

### ISSUE-02: SQL rollback chưa đồng nghĩa rollback domain local

Trên harness QA, dùng lô CREATED đã lưu; cho saveLot ném lỗi đúng một lần sau
recordEvent(HARVEST). Giữ snapshot SQL trước bước đó. Sau lỗi, đọc lại SQL rồi
gửi HARVEST theo lastEventId SQL. Kỳ vọng vẫn thực hiện được sau khi storage hồi
phục; hiện domain giữ HARVESTED và restoreLot không thay state đã có nên có thể
409. Đã tái hiện phần state này trong RAM; fault injection xuyên HTTP/MySQL và
cách khắc phục phải được kiểm tiếp trên QA, không dừng MySQL active để tái hiện.

Đoạn fixture sau tái hiện riêng trạng thái RAM (không kết nối MySQL):

```bash
node <<'NODE'
const assert = require('node:assert/strict');
const d = require('./backend/domain');
(async () => {
  const lot = d.createLot({lotId:'QA-RAM',productName:'QA',origin:'QA',
    harvestDate:'2026-11-05',location:'QA',regionCode:'QA-A',
    actorId:'f1',actorRole:'FARMER'});
  const persisted = structuredClone(lot);
  const failSave = async () => {throw new Error('simulated persistence failure');};
  try {
    d.recordEvent(lot.lotId, {eventType:'CTE_HARVEST',actorId:'f1',
      actorRole:'FARMER',actorRegion:'QA-A',location:'QA',
      previousEventId:persisted.lastEventId});
    await failSave();
  } catch (error) {
    assert.match(error.message, /simulated/);
  }
  d.restoreLot(persisted);
  assert.equal(persisted.status, 'CREATED');
  // Xác nhận lỗi hiện tại: RAM không về trạng thái đã persist.
  assert.equal(d.getLot(lot.lotId).status, 'HARVESTED');
  assert.notEqual(d.getLot(lot.lotId).lastEventId, persisted.lastEventId);
  console.log('Reproduced RAM/persisted-state mismatch');
  d.reset();
})().catch(error => {console.error(error); process.exitCode = 1;});
NODE
```

## 8. Tiêu chí nghiệm thu và thứ tự xử lý

1. **Ưu tiên sửa/tái hiện P1:** ISSUE-01 verifier, ISSUE-02 recovery RAM/SQL,
   ISSUE-03 lịch sử legacy và actor-role revocation trước các tính năng phụ.
2. Chốt sai khác holder, RECALL lặp, phạm vi vùng/cá nhân bằng tài liệu nghiệp vụ;
   không đổi chaincode chỉ để nút giao diện xanh.
3. Nghiệm thu demo MySQL: core FSM/RBAC/handover/QR/MySQL rollback đạt và giới hạn
   legacy/Fabric được công bố. Không gọi đây là nghiệm thu Blockchain đầy đủ.
4. Nghiệm thu Blockchain: FAB-01..10 phải có kết quả thật, danh tính/certificate,
   txId/commit code và đối soát SQL; không có P0/P1 chưa giải quyết ở luồng lõi.
5. Mọi GAP có quyết định phạm vi; chỉ số không đo được để chưa có dữ liệu.
6. Sau sửa lỗi: regression case riêng, chạy lại nhóm ảnh hưởng và chuỗi 7 CTE.
   Không xóa hash lịch sử, reset DB hoặc tắt IESH để vượt ca kiểm thử.

Mẫu bug report: ID → môi trường/mode/build → điều kiện trước → request/bước →
expected → actual → status/step/code → ID/ảnh/log đã che secret → ảnh hưởng →
bằng chứng SQL/ledger → mức ưu tiên → regression case. Ca BLOCKED/NOT_RUN không
được đưa vào tỷ lệ PASS. Chỉ tính tỷ lệ đạt trên các ca thực sự đã chạy cùng
phiên bản/môi trường; các kết quả fixture và Fabric thật phải báo riêng.

## Cập nhật sau khi bật lại mạng Fabric

Mạng Fabric cũ đã resume bằng container có sẵn, channel tracechannel và definition
traceability 1.0/sequence 1 đã query được. Backend vẫn ở local mode: ABI bản cũ
chỉ có CreateLot/RecordEvent/ReadLot/GetLotHistory, khác Gateway hiện tại; còn
thiếu role/region trên User1, signer theo actor và Org3. Vì vậy các ca FAB chưa
được đổi thành PASS. Xem [hướng dẫn bật mạng thật](./FABRIC_STARTUP.md).
