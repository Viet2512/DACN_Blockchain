const dataset = 'TC-DEMO-V1';
const organizations = [
  ['SX', 'HTX Nông Sản Miền Tây', 'FARM', 'Org1MSP', 'Cái Bè, Tiền Giang', 'sanxuat', 'FARMER'],
  ['SC', 'Công ty Sơ Chế Mekong', 'PROCESSING_FACILITY', 'Org1MSP', 'Mỹ Tho, Tiền Giang', 'soche', 'PROCESSOR'],
  ['VC', 'Công ty Vận Tải Đồng Bằng', 'LOGISTICS_COMPANY', 'Org2MSP', 'Bình Thủy, Cần Thơ', 'vanchuyen', 'TRANSPORTER'],
  ['PP', 'Công ty Phân Phối Sài Gòn', 'DISTRIBUTION_COMPANY', 'Org3MSP', 'Thủ Đức, TP.HCM', 'phanphoi', 'DISTRIBUTOR'],
].map(([key, name, type, mspId, address, slug, role], index) => ({
  key, code: `${dataset}-${key}`, name, type, mspId, address, slug, role,
  email: `${slug}@tracechain.invalid`, phone: `090200000${index + 1}`, status: 'ACTIVE',
}));
const users = [
  {username: 'tc_system', role: 'SUPER_ADMIN', fullName: 'Quản trị hệ thống demo', regionCode: 'GLOBAL'},
  ...organizations.flatMap(org => [
    {username: `tc_admin_${org.slug}`, role: 'BUSINESS_ADMIN', fullName: `Quản trị ${org.name}`, organizationCode: org.code, regionCode: 'TG-001'},
    ...[1, 2].map(index => ({username: `tc_nv_${org.slug}0${index}`, role: org.role, fullName: `Nhân viên ${index} · ${org.name}`, organizationCode: org.code, regionCode: 'TG-001'})),
  ]),
].map(user => ({...user, email: `${user.username}@tracechain.invalid`, phone: '0902000010'}));
// shortcut: the existing schema stores products on lots, add catalog CRUD only when the application needs independent products.
const products = ['Xoài Cát Hòa Lộc', 'Thanh long ruột đỏ', 'Bưởi da xanh', 'Sầu riêng Ri6', 'Chôm chôm', 'Nhãn', 'Chuối', 'Dừa', 'Cam sành', 'Rau cải xanh']
  .map((name, index) => ({code: `NS-${String(index + 1).padStart(2, '0')}`, name, unit: 'kg'}));
const sequence = ['CTE_CREATE', 'CTE_HARVEST', 'CTE_HANDOVER_PROCESSOR', 'CTE_RECEIVE_PROCESSOR', 'CTE_PROCESS', 'CTE_HANDOVER_SHIP', 'CTE_RECEIVE_SHIP', 'CTE_TRANSPORT', 'CTE_HANDOVER_RETAIL', 'CTE_DISPATCH_RETAIL', 'CTE_DISPLAY_SALE'];
const lots = [10, 10, 10, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 8, 8, 9, 9, 'recall', 2, 5].map((target, index) => ({
  lotId: `${dataset}-${String(index + 1).padStart(3, '0')}`, target,
  product: products[index % products.length], origin: 'Vùng trồng Cái Bè, Tiền Giang',
  harvestDate: `2026-11-${String(1 + index % 8).padStart(2, '0')}`, quantity: 100 + index * 10, staffIndex: index % 2 + 1,
}));
function expectedTypes(sample) {
  return sample.target === 'recall' ? ['CTE_CREATE', 'CTE_HARVEST', 'CTE_RECALL'] : sequence.slice(0, sample.target + 1);
}
module.exports = {dataset, organizations, users, products, lots, sequence, expectedTypes};
