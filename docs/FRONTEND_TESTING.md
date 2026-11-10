> **Cập nhật 06/11/2026:** xem [kết quả sửa lỗi và triển khai Fabric v2](./REMEDIATION_RESULTS.md) và [API hiện tại](./API_INTEGRATION.md). Nội dung bên dưới là khảo sát/kết quả của đợt trước; các hạn chế signer/Org3/ABI, rollback RAM, recall lặp và API nhật ký đã được xử lý theo báo cáo mới. 13 hash legacy vẫn được giữ nguyên.

# Kiểm thử Frontend và tích hợp

## Lệnh tái lập

```bash
cd frontend
npm ci
npm run typecheck
npm test
npm run build
```

Từ root, khi dependency Backend và chaincode cũng đã cài:

```bash
./scripts/test.sh
```

Script chạy backend tests, chaincode tests/build, Frontend tests và production
build. HTTP integration mở cổng loopback tạm; môi trường sandbox chặn listen
cần cho phép chạy ngoài sandbox. Các test Backend thay storage bằng fixture bộ
nhớ trong tiến trình test, đặt FABRIC_ENABLED=false, **không kết nối database**.

## Bộ ca tự động

### Frontend

- Không session → login, credential để trống, không có tài khoản hardcode.
- Khôi phục /auth/me; bỏ cached identity cũ; role giả trong localStorage không
  cấp quyền Admin; route khác role bị chặn.
- Dashboard Farmer/Processor/Transporter/Distributor/Admin với dữ liệu API test.
- Login đang gửi chặn gửi lặp; lỗi server được trình bày.
- Danh sách 12 lô: phân trang, tìm tên sản phẩm, lọc status và empty state.
- Mọi bước FSM chỉ đúng role; Admin/cross-region không ghi; lô thu hồi khóa.
- Nhận hàng đòi đúng MSP + region, kể cả khi lô đang nhìn thấy trong cùng vùng.
- Phục dựng pending từ history, xóa pending sau confirmation.
- Axios chỉ đính Bearer cho API private, encode mã lô, không gửi token tới public.
- 401 xóa phiên và phát sự kiện; giữ step/code khi conflict; timeout ghi đánh
  dấu chưa rõ kết quả và không retry.
- Form handover gửi cả top-level toOrg/toRegion và data đúng contract.
- Double submit chỉ gọi mutation một lần; chỉ refetch/success sau eventId mới
  và trạng thái đúng; timeout hoặc eventId không đổi không báo thành công.
- Public timeline không render arbitrary data/actorId; cảnh báo lô thu hồi và
  local mode; valid:null không được coi là đã xác minh.

### Backend

Domain: FSM hợp lệ; sai role/state; ngày không hợp lệ; restore lot sau restart
và không ghi đè state trong RAM bằng projection cũ.

HTTP integration: login đúng/sai, /me, thiếu token, khóa phiên, admin guard;
CREATE trùng mã; phục hồi lot từ storage sau reset RAM test; chuỗi nghiệp vụ đủ
7 bước + recall; sai previousEventId; confirmation trùng; Admin không ghi;
cross-region history/validate/documents; sai bên nhận MSP/region; nhận khác vùng
đúng bên nhận; public allowlist; hash tamper, broken link, lịch sử rỗng; lot/QR
không tồn tại; tài liệu rỗng trả valid:null.

### Chaincode

Build TypeScript và 2 test hiện có: Admin bị chặn ở Identity; Farmer tạo lô với
region hợp lệ và Processor không được bỏ qua bước HARVESTED. Fixture cũ thiếu
region được cập nhật; không sửa luật chaincode.

## Smoke test trình duyệt

Vite được khởi động bằng VS Code task. Cổng 3001 đang bận nên tiến trình chọn
http://localhost:3002. Đã mở trực tiếp /login và /trace/UNKNOWN; public route
hiển thị thông báo lỗi API và nút tải lại, không báo xác minh thành công.

Đã đo login ở viewport 1440, 768 và 390 px: không tràn ngang. Đã kiểm tra snapshot
accessibility: input có label, password dùng type password, nút login khóa khi
thiếu thông tin, public link và heading được browser nhận diện. Native dialog
được test ở jsdom với showModal shim mở thuộc tính open; focus trap/ESC dùng
hành vi native của browser, chưa kiểm chứng tự động đầy đủ bằng bàn phím.

## Chưa kiểm chứng trên hạ tầng thật

- Cập nhật: MySQL và Docker đã kiểm chứng thật. Fabric vẫn chưa bật; kiểm thử
  MySQL không được coi là bằng chứng giao dịch Fabric. Xem MYSQL_VERIFICATION.md.
- Chưa gửi giao dịch Fabric có certificate đa role, chưa kiểm MVCC và commit
  khi mất kết nối hay tái đồng bộ projection SQL.
- Upload/download bằng MySQL thật đã đạt trong DB kiểm thử riêng. Chưa in giấy,
  giải mã QR bằng camera điện thoại hoặc xác nhận PUBLIC_BASE_URL qua LAN.
- Chưa chạy audit accessibility toàn diện, browser Safari/Firefox, load test,
  hoặc dashboard có dữ liệu thật trên mọi kích thước.

Không reset, seed, xóa volume hay chỉnh chaincode/network để vượt qua giới hạn.

## Kịch bản nghiệm thu khi Backend sẵn sàng

1. Login từng role đã được cấp, refresh trang; kiểm tra /auth/me và route khác role.
2. Farmer tạo lotId duy nhất; thử thiếu dữ liệu/trùng ID/ngày sai.
3. Farmer HARVEST → Processor PROCESS → HANDOVER với MSP/vùng đích.
4. Transporter sai MSP/vùng phải bị chặn qua cả UI lẫn HTTP trực tiếp; đúng bên
   nhận xác nhận một lần; confirmation lặp trả lỗi.
5. Distributor DISPATCH_RETAIL → DISPLAY_SALE; kiểm tra tải lại sau ghi.
6. Vai trò nghiệp vụ RECALL: public cảnh báo, UI khóa bước tiếp theo.
7. Upload PDF/ảnh dưới 5 MiB, gắn vào sự kiện; đối soát fileHash/hash sự kiện;
   thử file thay đổi hoặc chưa gắn. URL /uploads cũ không còn công khai.
8. Admin xem users/actors/organizations/audit/report, khóa tài khoản đang có
   phiên; request tiếp theo phải 401, không thể tự khóa tài khoản đang dùng.
9. Kiểm IESH và đọc scope; lỗi API hoặc valid:null phải hiển thị chưa xác minh.
10. Quét QR trên điện thoại có API/Frontend LAN đúng; thử unknown, recalled và
    history chưa hoàn tất. Không xuất dữ liệu note/hợp đồng/contact/actorId.

## Kết quả lượt kiểm tra cuối

VS Code task `TraceChain: kiểm thử và build` đã chạy toàn bộ `scripts/test.sh`
thành công: **8/8 Backend, 2/2 chaincode, 23/23 Frontend**, tổng 33 ca.
TypeScript check và Vite production build đạt. `git diff --check` sạch, VS Code
Problems không có lỗi tại thời điểm kiểm tra. React Router 6 chỉ phát cảnh báo
future flags, không có test/build failure.

## Kiểm thử MySQL thật bổ sung

Chạy từ root: `node scripts/test-mysql.js`. Script tạo database và user ngẫu
nhiên chỉ dành cho kiểm thử, chạy schema MySQL hiện tại, thực thi 2 test rồi
xóa riêng database/user đó. Không nhận tên database active từ tham số.

Cả 2 test đạt: API authentication/role, users/actors/organizations/lots, FSM đủ
7 bước + recall, chứng từ upload/download/hash, public trace/QR, khôi phục từ
MySQL sau reset RAM, timestamp UTC/millisecond, DATE không bị đổi ngày, utf8mb4
emoji, FK, SQL parameter injection, rollback actor/lot khi có lỗi, và chặn đổi
hash đã lưu. Restart storage không thay đổi eventId/dataHash/integrityHash.

Lượt mặc định `scripts/test.sh` vẫn đạt 33 ca và build; 2 ca MySQL được skip có
chủ đích ở lệnh mặc định và chạy riêng bằng runner trên. Tổng 35 ca riêng biệt
đã thực thi thành công qua hai lượt.

`node backend/check-api.js` dùng credential hiện có trong .env: login/read/logout
trên API đang chạy, kiểm tra 25 GET của 3 lô hiện có. Không reset mật khẩu, không
thêm bản ghi vào database active. Browser đã đọc /trace/LOT-DEMO-001 qua API thật
ở cổng 3001, hiển thị 7 sự kiện và cảnh báo hash lịch sử; không tràn ngang ở
1440, 768, 390 px. Không dùng mock cho lượt browser này.

## Kịch bản kiểm thử toàn đồ án

Xem [101 ca kiểm thử có điều kiện/bước/kết quả mong đợi](./SYSTEM_TEST_SCENARIOS.md)
và [bảng kết quả CSV](./SYSTEM_TEST_RESULTS.csv). Bộ kịch bản mới phân biệt
bằng chứng đã chạy, lỗi fixture, dữ liệu legacy, API còn thiếu và ca Fabric bị
chặn. Không coi 35 ca tự động trước đó là đã bao phủ đủ 101 mã ca này.
