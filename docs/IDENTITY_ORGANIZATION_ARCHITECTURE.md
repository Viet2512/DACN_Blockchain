# Kiến trúc người dùng, doanh nghiệp và Fabric Identity

> Quản trị actor đã hợp nhất vào Người dùng; actor chỉ còn lớp tương thích. Xem [dependency audit, mapping và migration 005](./ACTOR_MODULE_CONSOLIDATION.md). Không còn form CRUD độc lập ở `/admin/actors`.

## Audit trước thay đổi — 06/11/2026

- Mạng hiện có ba MSP Org1/Org2/Org3, ba peer, ba CA và một orderer. Channel ứng dụng là tracechannel-v2, chaincode traceability_v2 version 2.0 sequence 1; channel tracechannel cũ vẫn giữ nguyên.
- MySQL: organizations có UNIQUE msp_id, nên đang đại diện Fabric Org, không chứa được hai doanh nghiệp cùng MSP. actors và user_accounts đều trỏ vào bảng này; nhiều account có thể trỏ cùng actor.
- Có bốn certificate nghiệp vụ theo actor/role và một certificate chỉ đọc. Gateway không dùng chung signer cho mọi role, nhưng hai account chung actor vẫn có thể chung signer. Certificate chưa có userId/businessOrganizationId.
- Role và MSP lấy từ account/actor/organization trong MySQL mỗi request. Account/actor/org inactive và actor_roles bị thu hồi đã được kiểm; phiên RAM TTL8h, password scrypt. ADMIN là role quản trị cũ.
- Chaincode kiểm MSP/role/region qua CA attributes, chưa phân biệt doanh nghiệp cùng MSP; handover chỉ ràng buộc MSP/vùng. FSM giữ nguyên CREATED→HARVESTED→PROCESSED→WAITING_SHIP→IN_TRANSIT→IN_RETAIL→READY_FOR_SALE, RECALLED khóa quy trình.
- Frontend dùng auth/me, role guards và availableEvents, nhưng chưa dùng permissions và Business Organization. Sidebar theo role, tài khoản được tạo qua actor.

## Kiến trúc mục tiêu và phạm vi

Fabric Organization → Business Organization → Application User → một Fabric Identity riêng cho người ký. Giữ nguyên ba MSP, channel, peer, endorsement policy. Thêm doanh nghiệp trong ứng dụng không thay đổi hạ tầng mạng.

Giữ bảng organizations cũ làm catalog Fabric Org, cung cấp API fabric-organizations rõ tên. Bổ sung business_organizations, application_user_profiles (UUID userId và username FK user_accounts), roles, permissions, role_permissions, fabric_identities, lot_business_scopes và audit liên kết user/doanh nghiệp. user_accounts tiếp tục giữ password/status và một role chính; đây là cấu trúc tương đương users + user_roles với chính sách một role/tổ chức chính ở phiên bản đồ án. API xuất SUPER_ADMIN, hỗ trợ ADMIN như alias dữ liệu cũ.

Role, loại doanh nghiệp và MSP phải khớp: FARMER/FARM/Org1, PROCESSOR/PROCESSING_FACILITY/Org1, TRANSPORTER/LOGISTICS_COMPANY/Org2, DISTRIBUTOR/DISTRIBUTION_COMPANY/Org3. Không tin organizationId trong body: đối chiếu DB, phiên và certificate.

## Quyền đối với lô

- Tạo lô: FARMER sở hữu lô trong doanh nghiệp của mình; chọn doanh nghiệp sơ chế và phân phối đang hoạt động.
- HARVEST chỉ doanh nghiệp nguồn; PROCESS/HANDOVER chỉ doanh nghiệp sơ chế được phân công; DISPATCH/DISPLAY chỉ doanh nghiệp phân phối được phân công.
- Handover chỉ định Business Organization nhận, MSP và vùng; mọi người có permission trong chính doanh nghiệp nhận có thể xác nhận. Doanh nghiệp khác cùng MSP/vùng không có quyền.
- currentHolder không đổi khi request; đổi sau confirm. Giữ thêm currentHolderOrganizationId và requestedBy/confirmedBy/from/to organization trong sự kiện.
- Đọc theo các doanh nghiệp có quan hệ/phân công, không chỉ theo vùng. SUPER_ADMIN đọc giám sát, không ghi CTE.
- Lô legacy thiếu business scope được giữ nguyên và chỉ Admin giám sát, không tự đoán chủ thể hay viết lại hash/lịch sử. Việc đối soát legacy là thao tác riêng.

## Certificate và chaincode

CA attributes: userId, businessOrganizationId, role, region, actorId. Chaincode lấy danh tính từ certificate, ghi signerId (X.509 ID), User ID và Business Org vào sự kiện; không tin trường actor/role/org tự khai. Gateway ánh xạ theo userId và bản ghi ACTIVE trong fabric_identities, kiểm snapshot role/MSP/organization/vùng; private key chỉ là file reference trong kho riêng ngoài source/image.

Cấp chứng thư là tác vụ vận hành bằng CA registrar, không phải quyền tự động của SUPER_ADMIN ứng dụng. UI chỉ hiển thị trạng thái; tạo account chưa cấp chứng thư vẫn PENDING và không ký được. Khóa account thu hồi phiên ứng dụng, không giả rằng đã revoke certificate CA. Thu hồi CA/CRL là quy trình vận hành riêng.

Chaincode cần nâng cấp lifecycle tại **cùng channel và tên chaincode**, sequence tăng, không reset ledger. Lot schemaVersion mới bật ràng buộc business/user. Lô/event cũ query/validate được theo schema cũ; không được tiếp tục ghi bằng chứng thiếu user/business attributes. Không rewrite event cũ.

## Migration an toàn và rollback

1. Dump MySQL single-transaction + checksum, backup uploads, ghi counts/fingerprint/chaincode definition và channel height.
2. Test migration trên DB ngẫu nhiên riêng. Chỉ thêm bảng, không DROP/ALTER bảng lịch sử; backfill profile/account IDs và doanh nghiệp legacy rõ provenance, không sửa event/hash/TxID.
3. Cập nhật storage/auth/API/Frontend; giữ endpoint cũ khi có thể, aliases rõ ràng. Bootstrap tài khoản rỗng phải tạo đủ profile SUPER_ADMIN.
4. Test chaincode fixture: role sai cùng MSP; receiver sai doanh nghiệp cùng MSP; nhiều user cùng doanh nghiệp ký riêng; backward-read schema cũ.
5. Package/approve/commit bản chaincode mới đúng lifecycle sau test và kiểm dữ liệu. Không đổi channel/MSP/policy.
6. Enroll certificate **mới** theo user, giữ khóa/certificate cũ. Mapping mới ACTIVE chỉ sau kiểm khớp metadata và certificate.
7. Test API/Fabric thật trên DB riêng, deploy riêng Backend/Frontend, smoke/readiness, đối chiếu dữ liệu cũ.

Rollback ứng dụng dùng image trước cập nhật; không drop bảng mới, không import đè DB. Chaincode không thể giảm sequence; nếu cần rollback phải package code tương thích với sequence tiếp theo và không mở lại quyền ghi legacy. Ledger đã commit không rollback bằng SQL. Snapshot backup phục hồi sang DB khác trước khi cutover.

## Rủi ro cần kiểm chứng

Scope cũ theo vùng rộng hơn scope doanh nghiệp; việc siết quyền có thể làm tài khoản cũ không thấy lô legacy (chủ đích tránh rò dữ liệu). Certificate cũ thiếu user/business không được dùng ký mới. Đổi tổ chức/role khi đã có identity phải làm mất hiệu lực mapping và cấp identity mới, không sửa private key. Hai kho SQL/ledger không có distributed transaction: giữ CAS/MVCC và reconcile sau lỗi SQL, không submit lại mù quáng.

## Tài liệu báo cáo

Đã trích xuất cả ba PDF (hai bản đề cương trùng nội dung, báo cáo giữa kỳ 40 trang), đối chiếu Chương 2: Bảng 2.1, Bảng 2.2, mục 2.6–2.7. Bảng quyền cho phép Farmer tạo request nhưng FSM yêu cầu PROCESSED; phiên bản này giữ PROCESSOR làm bên tạo request như source đang triển khai, không cho Farmer bỏ qua PROCESS. Source cho bốn role nghiệp vụ recall, được giữ cho các doanh nghiệp có quan hệ với lô. Mở rộng Business Organization và User ID từ chứng thư theo Master Prompt mới; không sửa các sự kiện CTE/FSM cốt lõi.

## Kết quả migration ban đầu

Migration 004 đã áp dụng sau backup SQL `mysql-20261105T181513Z-Ks78KA.sql` và fingerprint riêng. Có 3 MSP, 5 doanh nghiệp legacy, 7 profile cho 7 account. 10 bảng trước nâng cấp giữ nguyên fingerprint. Đã cấp 6 danh tính theo user; các certificate/key theo actor cũ không bị thay thế. Hai account cùng actor vẫn có userId và enrollment khác nhau.

Các test trước nâng lifecycle: 5 chaincode tests, 4 MySQL integration tests, 5 HTTP fixture tests, 3 business identity API tests và 26 Frontend tests qua. Các kết quả này chưa thay thế kiểm thử certificate và commit trên mạng thật sau nâng cấp.
