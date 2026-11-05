const API_URL = process.env.API_URL || 'http://localhost:8080/api';

const actors = [
  {actorId: 'farmer-01', mspId: 'Org1MSP', regionCode: 'TG-001', fabricIdentity: 'x509::/CN=farmer-01', fullName: 'Nguyễn Văn An', email: 'an@nongsan.test', phone: '0900000001', actorType: 'FARMER', roles: ['FARMER']},
  {actorId: 'processor-01', mspId: 'Org1MSP', regionCode: 'TG-001', fabricIdentity: 'x509::/CN=processor-01', fullName: 'Trần Thị Bình', email: 'binh@soche.test', phone: '0900000002', actorType: 'PROCESSOR', roles: ['PROCESSOR']},
  {actorId: 'transporter-01', mspId: 'Org2MSP', regionCode: 'TG-001', fabricIdentity: 'x509::/CN=transporter-01', fullName: 'Lê Văn Chuyển', email: 'chuyen@vanchuyen.test', phone: '0900000003', actorType: 'TRANSPORTER', roles: ['TRANSPORTER']},
  {actorId: 'distributor-01', mspId: 'Org3MSP', regionCode: 'TG-001', fabricIdentity: 'x509::/CN=distributor-01', fullName: 'Phạm Thị Phân', email: 'phan@phanphoi.test', phone: '0900000004', actorType: 'DISTRIBUTOR', roles: ['DISTRIBUTOR']},
];
const fullChain = [
  ['CTE_HARVEST', 'FARMER', 'Vùng trồng Tiền Giang', 'farmer-01', 'Giấy chứng nhận thu hoạch VietGAP.pdf'],
  ['CTE_PROCESS', 'PROCESSOR', 'Nhà sơ chế Tiền Giang', 'processor-01', 'Phiếu sơ chế và đóng gói.pdf'],
  ['CTE_HANDOVER_SHIP', 'PROCESSOR', 'Kho sơ chế Tiền Giang', 'processor-01'],
  ['CTE_RECEIVE_SHIP', 'TRANSPORTER', 'Trạm vận chuyển miền Tây', 'transporter-01', 'Biên bản nhận hàng vận chuyển.pdf'],
  ['CTE_DISPATCH_RETAIL', 'DISTRIBUTOR', 'Kho phân phối TP.HCM', 'distributor-01'],
  ['CTE_DISPLAY_SALE', 'DISTRIBUTOR', 'Siêu thị TP.HCM', 'distributor-01', 'Phiếu nhập kho điểm bán.pdf'],
];
let adminToken;
const credentials = {
  'farmer-01': ['demo-farmer', 'demo123', 'FARMER', 'Org1MSP'],
  'processor-01': ['demo-processor', 'demo123', 'PROCESSOR', 'Org1MSP'],
  'transporter-01': ['demo-transporter', 'demo123', 'TRANSPORTER', 'Org2MSP'],
  'distributor-01': ['demo-distributor', 'demo123', 'DISTRIBUTOR', 'Org3MSP'],
};

async function request(path, options = {}) {
  const headers = {...(options.headers || {})};
  if (adminToken) headers.Authorization = 'Bearer ' + adminToken;
  const response = await fetch(`${API_URL}${path}`, {...options, headers});
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${body?.message || body?.error || response.statusText}`);
  return body;
}

async function createDocument(lotId, originalName) {
  if (!originalName) return null;
  const form = new FormData();
  form.append('document', new Blob([`Demo document for ${lotId}: ${originalName}`], {type: 'text/plain'}), originalName);
  form.append('lotId', lotId);
  return request('/documents', {method: 'POST', body: form});
}

async function recordEvent(lot, [eventType, actorRole, location, actorId, documentName]) {
  const [username, password] = credentials[actorId];
  adminToken = (await request('/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password})})).token;
  const document = await createDocument(lot.lotId, documentName);
  return request(`/lots/${encodeURIComponent(lot.lotId)}/events`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      eventType, actorId, actorRole, location, previousEventId: lot.lastEventId,
      data: {
        note: `Dữ liệu mẫu kiểm thử ${eventType}`,
        ...(eventType === 'CTE_HANDOVER_SHIP' ? {toOrg: 'Org2MSP', toRegion: 'TG-001'} : {}),
        ...(document ? {documentHash: document.fileHash} : {}),
      },
    }),
  });
}

async function createOrGetLot(input) {
  const savedToken = adminToken;
  const admin = await request('/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123'})});
  adminToken = admin.token;
  try { return await request(`/lots/${encodeURIComponent(input.lotId)}`); } catch (error) {
    if (!/404|not found/i.test(error.message)) throw error;
    adminToken = (await request('/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'demo-farmer', password: 'demo123'})})).token;
    return request('/lots', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
  } finally {
    if (adminToken === admin.token) adminToken = savedToken;
  }
}

async function seedLot(input, events) {
  let lot = await createOrGetLot(input);
  for (const event of events) {
    if (lot.events.some((item) => item.eventType === event[0])) continue;
    lot = await recordEvent(lot, event);
  }
  return lot;
}

async function main() {
  await request('/health');
  const login = await request('/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD || 'admin123'}),
  });
  adminToken = login.token;
  for (const actor of actors) await request('/actors', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(actor)});
  for (const actor of actors) {
    const [username, password, role, orgMsp] = credentials[actor.actorId];
    await request('/users', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password, role, orgMsp, actorId: actor.actorId})});
  }
  adminToken = (await request('/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'demo-farmer', password: 'demo123'})})).token;
  const completed = await seedLot({lotId: 'LOT-DEMO-001', productName: 'Xoài cát Hòa Lộc', origin: 'Vùng trồng đạt chuẩn Tiền Giang', regionCode: 'TG-001', harvestDate: '2026-10-28', actorId: 'farmer-01', actorRole: 'FARMER', location: 'Mã vùng TG-001'}, fullChain);
  const recalled = await seedLot({lotId: 'LOT-DEMO-002', productName: 'Thanh long ruột đỏ', origin: 'Hợp tác xã Bình Thuận', regionCode: 'TG-001', harvestDate: '2026-10-30', actorId: 'farmer-01', actorRole: 'FARMER', location: 'Mã vùng TG-001'}, [fullChain[0], ['CTE_RECALL', 'FARMER', 'Kho kiểm soát chất lượng', 'farmer-01', 'Biên bản thu hồi kiểm thử.pdf']]);
  console.log(JSON.stringify({message: 'Demo supply-chain data is ready', lots: [{lotId: completed.lotId, status: completed.status, eventCount: completed.eventCount}, {lotId: recalled.lotId, status: recalled.status, eventCount: recalled.eventCount}]}, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
