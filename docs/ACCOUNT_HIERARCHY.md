> **Bàn giao ổn định 09/11/2026:** Xem [FINAL_DELIVERY](./FINAL_DELIVERY.md) cho startup/menu/kết quả test hiện hành. Các số liệu trong tài liệu này thuộc lượt triển khai trước.

# Tài khoản phân cấp TraceChain

Triển khai ngày 09/11/2026 (Asia/Bangkok). Dùng Express 5, MySQL 8, React/TypeScript, React Query và Fabric Gateway hiện có; không thêm dependency.

## Khảo sát và phạm vi

Tái sử dụng [auth](../backend/auth.js), [storage](../backend/storage.js), [authorization](../backend/authorization.js), [Gateway](../backend/fabric.js), [IESH](../chaincode/src/traceability.ts), các bảng tài khoản/profile/doanh nghiệp/roles/permissions/Fabric identities/audit hiện có. Không tạo bảng users hoặc user_roles trùng chức năng: một tài khoản có một role hiện hành và một doanh nghiệp; `ADMIN` cũ vẫn ánh xạ `SUPER_ADMIN`.

Đường ảnh hưởng đã kiểm tra: login/me/logout/đổi mật khẩu, CRUD user/status/reset-password, quản lý doanh nghiệp, script enrollment/seed, migration/schema mới, các API lot/event/handover/recall/document, route guard/sidebar/profile/dashboard và fixtures kiểm thử. Không chỉnh sửa chaincode trong đợt triển khai tài khoản này. Các thay đổi chaincode có sẵn trong working tree được giữ nguyên.

## Kiến trúc và quyền

| Cấp | Phạm vi | Ghi giao dịch nghiệp vụ |
| --- | --- | --- |
| System Admin (`SUPER_ADMIN`, alias `ADMIN`) | Doanh nghiệp, quản trị viên, mapping MSP theo chính sách hiện có, giám sát/audit | Không có permission CTE mặc định |
| Business Admin (`BUSINESS_ADMIN`) | Quản lý nhân viên đúng doanh nghiệp, xem hoạt động và lô liên quan, yêu cầu/ngừng sử dụng danh tính của nhân viên | Không có permission CTE; không cấp chứng thư nghiệp vụ |
| Staff (`FARMER`, `PROCESSOR`, `TRANSPORTER`, `DISTRIBUTOR`) | Nghiệp vụ tương ứng loại doanh nghiệp, dữ liệu có liên quan | Cần permission, scope, trạng thái IESH và chứng thư cá nhân hợp lệ |
| Người tiêu dùng | QR/timeline công khai qua projection allowlist | Không |

`Business Organization` trong MySQL không phải Fabric Organization. Nhiều doanh nghiệp có thể dùng chung MSP; chứng thư CA chứa `userId`, `businessOrganizationId`, `role`, `region`. Chaincode kiểm tra thuộc tính này, MSP, chủ sở hữu, người nhận và FSM. Thêm doanh nghiệp không tạo peer, MSP hay CA. Mapping vẫn giới hạn theo chính sách mạng/chaincode hiện có: FARM và PROCESSING_FACILITY → Org1MSP, LOGISTICS_COMPANY → Org2MSP, DISTRIBUTION_COMPANY → Org3MSP. Không cho đổi loại/MSP khi đã có tài khoản.

Session là token opaque sống 8 giờ, chỉ giữ SHA-256 token trong RAM. Mỗi request bảo vệ nạp lại account/status/doanh nghiệp/permissions từ MySQL. Khóa tài khoản hoặc doanh nghiệp, thay role và đổi mật khẩu thu hồi phiên; thay permission có hiệu lực ở request tiếp theo. Triển khai hiện tại dùng một backend process; restart đăng xuất các phiên. Không có refresh token.

Tenant scope lấy từ session đã được MySQL xác thực. Business Admin chỉ quản lý role nghiệp vụ tương ứng loại doanh nghiệp, không quản lý admin khác hoặc chính mình. Tham số `organizationId` chéo tenant bị từ chối; khi không gửi, backend tự điền doanh nghiệp. API cũ được kiểm tra cùng chính sách. Lịch sử tác nhân cũ được bảo toàn qua user_actor_mappings.

## Migration và bảo toàn dữ liệu

[007-account-hierarchy.sql](../backend/migrations/007-account-hierarchy.sql) bổ sung `BUSINESS_ADMIN`, quyền quản lý phù hợp, bảng `account_invitations` và `fabric_identity_requests` có FK/index. [Runner](../scripts/migrate-accounts.js) mở rộng ENUM account bằng giá trị cuối `PENDING_ACTIVATION`, thêm `last_login_at` nếu chưa có. Không xóa, đổi role hoặc kích hoạt lại tài khoản cũ.

Trước khi nâng cấp một môi trường khác:

```bash
bash scripts/backup-mysql.sh
node scripts/migrate-accounts.js
```

Runner đọc cấu hình MySQL hiện có, chạy lại được. Schema khởi tạo mới cũng chứa migration. Runner cũ 005 vẫn dùng để bổ sung phone/mappings khi nâng từ schema trước đó; 007 giả định nền tảng 004–006 đã tồn tại.

Môi trường hiện tại đã backup và áp dụng 007. Kiểm chứng [preservation](../reports/account-hierarchy-preservation.json): cả 400 dòng cũ của 22 bảng gốc giữ nguyên giá trị các cột cũ. Backup và fingerprint riêng nằm trong thư mục backups đã bị Git bỏ qua. Migration được chạy lại hai lần trên database test có tài khoản, invitation và lịch sử, không mất dữ liệu.

Không cung cấp down migration xóa bảng/lời mời vì làm mất dữ liệu bảo mật. Khi rollback ứng dụng, giữ schema mở rộng và backup; backend cũ không hỗ trợ đăng nhập Business Admin. Không reset hoặc restore đè database đang chạy để rollback.

## Invitation và kích hoạt

System Admin tạo doanh nghiệp rồi mời Business Admin. Business Admin mời Staff đúng loại hình doanh nghiệp. Tạo account, profile, role nghiệp vụ/actor cần thiết, invitation và audit nằm cùng transaction. Mật khẩu placeholder sinh ngẫu nhiên phía server; không gửi hoặc trả về. Account mới `PENDING_ACTIVATION` không đăng nhập được.

Token ngẫu nhiên 256 bit, database chỉ lưu SHA-256, hạn 24 giờ. Accept invitation khóa bản ghi trong transaction, kiểm tra hạn/used/status/doanh nghiệp, băm mật khẩu bằng scrypt có salt và kích hoạt. Mật khẩu kích hoạt mới dài 12–1024 ký tự. Accept và reissue vô hiệu hóa các lời mời cũ; token hết hạn/đã dùng không tái sử dụng được. Có thể khóa cả tài khoản pending; lời mời bị từ chối khi khóa. Mở khóa tài khoản chưa từng kích hoạt đưa nó về PENDING_ACTIVATION, không bypass kích hoạt; reset-password không kích hoạt pending.

**Chưa có email transport:** chỉ khi `NODE_ENV=development` hoặc `test`, response quản trị mới có token kèm `Cache-Control: no-store`. UI hiển thị liên kết một lần trong trạng thái trang, dùng fragment `/activate#token`; trang kích hoạt xóa fragment khỏi URL. Không lưu invitation vào localStorage/sessionStorage. Chuyển liên kết riêng cho người nhận; không đưa vào ảnh chụp, log, issue hoặc báo cáo. Production (kể cả NODE_ENV không đặt) trả 503 trước khi tạo account/token. Đây là cơ chế development có giới hạn, chưa phải email invitation cho production.

## API

| API | Quyền và hành vi |
| --- | --- |
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | Giữ API cũ; nạp lại quyền/trạng thái từ MySQL; ghi last_login_at |
| `POST /api/auth/change-password` | Kiểm tra mật khẩu cũ, mật khẩu mới 12–1024, rate limit, thu hồi phiên |
| `POST /api/auth/accept-invitation` | Public, token một lần + password; rate limit; lỗi không tiết lộ account |
| `GET /api/users` | System thấy toàn hệ thống; Business Admin chỉ thấy staff mình quản lý |
| `POST /api/users/invitations` | System mời Business Admin; Business Admin mời staff cùng doanh nghiệp |
| `POST /api/users/:username/invitation` | Gửi lại invitation pending đúng scope, vô hiệu hóa token cũ |
| `PATCH /api/users/:username` | Whitelist trường, kiểm tra cả target cũ và role/scope mới; thu hồi session/mapping khi cần |
| `PATCH /api/users/:username/status` | Khóa/mở đúng scope; không kích hoạt pending |
| `POST /api/users/:username/reset-password` | Legacy System Admin-only; Business Admin không đặt mật khẩu thay nhân viên |
| `POST /api/users` | Giữ tương thích cho System Admin và script cũ; Business Admin phải dùng invitation |
| `GET/POST/PATCH /api/business-organizations[/:id]` | Giữ API doanh nghiệp; CRUD/mapping dành cho System Admin; directory đối tác chỉ có trường cần chọn bàn giao |
| `GET /api/admin/permissions` | Business Admin chỉ nhận role nghiệp vụ được phép gán |
| `GET /api/fabric-identities` | Staff thấy mình; Business Admin thấy doanh nghiệp; System thấy tất cả; không trả key/reference |
| `GET /api/fabric-identity-requests` | Danh sách yêu cầu theo scope quản trị |
| `POST /api/users/:username/fabric-identity/request` | Staff yêu cầu cho mình hoặc Business Admin cho staff; account/org/MSP phải hoạt động |
| `POST /api/users/:username/fabric-identity/disable` | Business Admin đúng tenant hoặc System Admin; ngừng sử dụng signer ở backend |
| `GET /api/business/activity` | Nhật ký thuộc doanh nghiệp, hoặc toàn hệ thống cho System |
| Các `/api/admin/*` giám sát/audit/transaction | Giữ permission backend hiện có; không mở cho Business Admin |

API quản trị và cấp quyền ghi audit. Lỗi dùng error handler tập trung; audit không lưu password/token/private key. Các permission nghiệp vụ tiếp tục được kiểm tra trước mọi đường ghi lot/event/handover/recall. Không có API mới để bỏ qua IESH.

## Fabric Identity

1. Account kích hoạt và doanh nghiệp hoạt động, có MSP đúng policy.
2. Staff hoặc Business Admin tạo yêu cầu.
3. System xem yêu cầu trong trang danh tính; CA operator được ủy quyền kiểm tra và chạy:

```bash
node scripts/enroll-fabric-users.js --username <ten-tai-khoan>
# Hoặc xử lý các yêu cầu PENDING đã được người vận hành duyệt:
node scripts/enroll-fabric-users.js --pending
```

4. Operator dùng registrar hiện có, đăng ký/enroll certificate có thuộc tính user/doanh nghiệp/role/region; private key giữ phía backend, file mode 0600. Không tự enroll tất cả account khi không có tham số.
5. Trước khi link, transaction nạp lại và khóa account/business để từ chối mapping nếu thông tin đã thay đổi. Lưu reference/fingerprint, cập nhật request ISSUED, ghi audit CA_OPERATOR.
6. Gateway chọn chứng thư từ user đã xác thực, kiểm tra fingerprint/hạn và đối chiếu `GetSignerIdentity` do chaincode trả. Trước khi lấy cả kết nối đã cache, storage kiểm tra lại account và permission hiện hành.
7. Ngừng ký đổi mapping sang DISABLED; request sau bị từ chối kể cả Gateway đã cache kết nối. Khóa web account cũng ngăn direct signing khi còn giữ user object cũ.

**DISABLED không phải X.509 revocation.** Không thay CA CRL/channel MSP trong nhiệm vụ này. Nếu khóa riêng bị lộ, operator phải revoke certificate trên CA và phân phối CRL theo quy trình mạng. Giao dịch đã endorse/submit trước thời điểm khóa có thể vẫn commit. Cấp phát chỉ được xác minh với Fabric test-network và CA hiện tại, không khẳng định hỗ trợ một mạng production/HSM khác.

## Frontend

- [App](../frontend/src/App.tsx): activation public và business routes, giữ routes nghiệp vụ cũ.
- [AdminUsersPage](../frontend/src/pages/admin/AdminUsersPage.tsx): tái sử dụng trang quản trị làm trang Nhân viên; mời thay mật khẩu khởi tạo, tìm/lọc/phân trang bằng DataTable có sẵn, status, role, reissue, request/disable signer.
- [ActivationPage](../frontend/src/pages/auth/ActivationPage.tsx): tự đặt và xác nhận mật khẩu, loading/error/success tiếng Việt.
- [BusinessPage](../frontend/src/pages/shared/BusinessPage.tsx): thông tin doanh nghiệp và hoạt động theo scope backend.
- [ProfilePage](../frontend/src/pages/shared/ProfilePage.tsx): thông tin cá nhân, đổi mật khẩu, yêu cầu chứng thư phù hợp; thông tin kỹ thuật trong details; admin không bị báo lỗi PENDING Fabric.
- [IdentityAdminPages](../frontend/src/pages/admin/IdentityAdminPages.tsx): theo dõi request và chứng thư, không lộ private key.
- [navigation](../frontend/src/utils/navigation.ts): System có 5 nhóm; Business Admin có Tổng quan/Nhân viên/Hoạt động/Doanh nghiệp/Tài khoản; Staff giữ menu nghiệp vụ theo permission.
- [types](../frontend/src/types.ts), [permissions](../frontend/src/utils/permissions.ts), [API client](../frontend/src/services/api.ts) và [UI tests](../frontend/src/App.test.tsx) được cập nhật cùng nhau.

Route guards chỉ hỗ trợ trải nghiệm; backend mới là nơi quyết định quyền. Không thêm dữ liệu giả.

## Kiểm thử thực tế

| Lệnh | Kết quả |
| --- | --- |
| Backend: `npm test` trong backend | 20 PASS, 28 SKIP (integration chưa bật trong lệnh này) |
| Chaincode: `npm test` trong chaincode | 10 PASS |
| Frontend: `npm test` và `npm run build` trong frontend | 57 PASS; TypeScript và production build đạt |
| `node scripts/test-mysql.js` | 8 PASS: FK, UTF-8, rollback/concurrency, login/password, document/QR, role revocation, compatibility |
| `node scripts/test-mysql.js --accounts --fabric` | 7 PASS: hierarchy/invitation/activation, IDOR/escalation, expiry/replay/production refusal, Fabric enrollment/commit/disable, repeatable migration, phục hồi Business Admin, rate limit |
| `node scripts/test-mysql.js --identity --fabric` | 5 PASS, 1 SKIP: danh tính riêng, FSM đầy đủ ba bàn giao, sai doanh nghiệp cùng MSP, QR/thu hồi, SQL recovery và concurrent ledger writers; benchmark nghiên cứu không bật |

Các lệnh MySQL tạo database/user `tracechain_test_*` riêng, chỉ xóa đúng database/user vừa tạo. Không gửi account QA vào database ứng dụng. Giao dịch test Fabric ghi các lot QA có ID riêng lên channel hiện có; lịch sử append-only này không bị xóa sau test. [Bằng chứng Fabric](../reports/account-hierarchy-fabric.json) ghi transaction ID, commit COMMITTED_VALID và kiểm chứng lịch sử, không chứa credential.

Không đánh dấu các bài SKIP là PASS. Không chạy benchmark tải dài, khôi phục backup hoặc kiểm thử email/CRL production trong đợt này. UI có 57 component/route tests và build. Đã smoke bằng trình duyệt trang activation thiếu token; chưa chạy toàn bộ kịch bản bằng trình duyệt/mobile thực. Smoke HTTP trên bản Docker local đã xác minh MySQL/Fabric ABI v4, frontend/proxy, 401 khi chưa đăng nhập, đăng nhập System Admin cấu hình sẵn, đọc API mới và logout; không tạo dữ liệu QA trong database ứng dụng.

## Test end-to-end local

Ứng dụng local được triển khai bằng cấu hình Fabric hiện có, bật explicit development:

```bash
NODE_ENV=development docker compose -f docker-compose.yml -f docker-compose.fabric.yml up -d --build --no-deps backend frontend
```

1. Mở `http://localhost:3001`, dùng System Admin hiện có; không có mật khẩu mặc định mới.
2. Vào Doanh nghiệp, tạo doanh nghiệp với loại hình phù hợp MSP hiện có.
3. Vào Người dùng, Mời tài khoản: chọn Business Admin và doanh nghiệp. Chuyển riêng liên kết development cho người nhận.
4. Mở liên kết ở phiên khác, đặt mật khẩu từ 12 ký tự; đăng nhập Business Admin.
5. Vào Nhân viên, mời staff; thử gửi doanh nghiệp khác bằng request phải bị từ chối. Kích hoạt staff rồi đăng nhập.
6. Yêu cầu chứng thư trong chi tiết tài khoản hoặc trang Nhân viên. CA operator chạy lệnh enrollment ở trên cho đúng username.
7. Staff nhà sản xuất tạo lô với cơ sở sơ chế và phân phối thật; lần lượt thu hoạch → giao sơ chế → cơ sở sơ chế nhận/xử lý → giao vận chuyển → vận chuyển nhận → giao phân phối → phân phối nhận/đưa lên kệ. Mỗi account cần chứng thư riêng đúng doanh nghiệp/vùng.
8. Thử Business Admin/System Admin ghi sự kiện, doanh nghiệp B nhận thay A, hoặc nhận khi chưa bàn giao: phải bị từ chối.
9. Khóa staff từ Business Admin; token cũ phải nhận 401. Ngừng ký Fabric làm account vẫn đọc được nhưng gửi CTE bị 403. Xem transaction và validate history/QR.
10. Thử dùng lại token activation, token hết hạn hoặc sửa role thành SUPER_ADMIN: bị từ chối.

## Giới hạn và Git

Chưa hoàn thiện gửi email production, tự động thu hồi certificate/CRL, session store/rate limiter cho nhiều backend process, và kiểm thử trình duyệt đa thiết bị. Các phần này không được tuyên bố đã hoàn thành. Phục hồi Business Admin dùng luồng sẵn có: System Admin xác minh người đại diện doanh nghiệp qua kênh tin cậy, khóa admin cũ để thu hồi phiên, mời admin thay thế cùng doanh nghiệp, người nhận tự đặt mật khẩu. Không đổi chủ sở hữu lô/MSP hay dùng lại password/certificate của người cũ. Bài tích hợp kiểm tra khóa phiên cũ, kích hoạt admin thay thế và đúng tenant; bước xác minh người đại diện ngoài hệ thống thuộc quy trình vận hành, chưa kiểm thử tự động.

Deployment local có invitation development trả token cho quản trị viên, chỉ dùng trong môi trường tin cậy. Chuyển sang production phải đặt NODE_ENV=production; lời mời sẽ fail closed cho đến khi có delivery transport an toàn. API tạo/reset mật khẩu legacy dành riêng System Admin vẫn tồn tại để bảo toàn callers cũ; UI tạo mới dùng invitation.

Branch hiện tại: `main`; working tree tại thời điểm báo cáo có 51 đường dẫn tracked thay đổi và 82 mục untracked (Git gộp một số thư mục), gồm cả thay đổi đã có trước nhiệm vụ. Không commit, stage, push, rebase, reset hoặc đổi branch; không đưa AGENTS.md/.env/backup/key vào Git. Thay đổi runtime chỉ khởi động container cũ, migration cộng thêm và rebuild hai container ứng dụng, không đổi định nghĩa mạng/chaincode/channel.
