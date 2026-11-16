// Rehearse only the dedicated lot; credentials stay in memory and existing lots are never advanced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const live = process.argv.includes('--live');
const file = path.join(root, live ? 'reports/live-demo-browser.json' : 'reports/rehearsal-browser-20261117.json');
let password = '';
const safe = message => password ? String(message).split(password).join('[REDACTED]') : String(message);
async function main() {
  assert.equal(process.env.DEMO_DATA_ENABLED, 'true', 'Explicit DEMO_DATA_ENABLED=true required for live rehearsal');
  if (process.env.TRACECHAIN_REHEARSAL_BROWSER !== 'true') {
    password = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, '.env'))).DEMO_PASSWORD;
    assert.ok(password?.length >= 8 && password.length <= 1024);
    const modules = path.dirname(path.dirname(require.resolve('playwright/package.json')));
    const result = spawnSync('docker', ['run', '--rm', '--network', 'container:tracechain-frontend', '--shm-size=256m',
      '-e', 'DEMO_PASSWORD', '-e', 'DEMO_DATA_ENABLED=true', '-e', 'TRACECHAIN_REHEARSAL_BROWSER=true', '-e', 'NODE_PATH=/tools/node_modules',
      '-v', `${modules}:/tools/node_modules:ro`, '-v', `${__filename}:/work/scripts/rehearsal-browser.js:ro`,
      '-v', `${path.join(root, 'reports')}:/work/reports`, 'mcr.microsoft.com/playwright:v1.65.0-noble', 'node', '/work/scripts/rehearsal-browser.js', ...(live ? ['--live'] : [])],
      {env: {...process.env, DEMO_PASSWORD: password}, stdio: 'inherit'});
    assert.equal(result.status, 0, 'Browser rehearsal failed; see its sanitized JSON evidence');
    return;
  }
  password = process.env.DEMO_PASSWORD;
  const fixture = JSON.parse(fs.readFileSync(path.join(root, live ? 'reports/live-demo-fixture.json' : 'reports/rehearsal-20261117.json'), 'utf8'));
  const actors = fixture.actors || {farmer: 'tc_rehearsal_farm_a', processor: 'tc_nv_soche01', transporter: 'tc_nv_vanchuyen01', distributor: 'tc_nv_phanphoi01'};
  const evidence = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {lotId: fixture.lotId, uiCommits: [], rejections: [], runs: []};
  assert.equal(evidence.lotId, fixture.lotId, 'Do not mix evidence from different lots');
  const {chromium} = require('playwright');
  const base = 'http://127.0.0.1:3000', sessions = new Map();
  const browser = await chromium.launch({headless: true});
  const expected = ['CTE_CREATE', 'CTE_HARVEST', 'CTE_HANDOVER_PROCESSOR', 'CTE_RECEIVE_PROCESSOR', 'CTE_PROCESS', 'CTE_HANDOVER_SHIP', 'CTE_RECEIVE_SHIP', 'CTE_TRANSPORT', 'CTE_HANDOVER_RETAIL', 'CTE_DISPATCH_RETAIL', 'CTE_DISPLAY_SALE'];
  async function user(username) {
    if (sessions.has(username)) return sessions.get(username);
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
    await page.goto(base + '/login');
    await page.getByLabel('Tên đăng nhập', {exact: true}).fill(username);
    await page.getByLabel('Mật khẩu', {exact: true}).fill(password);
    await page.getByRole('button', {name: 'Đăng nhập →', exact: true}).click();
    await page.waitForURL(url => url.pathname.endsWith('/dashboard'));
    const token = await page.evaluate(() => sessionStorage.getItem('tracechain-token'));
    const result = {page, context, headers: {Authorization: `Bearer ${token}`}};
    sessions.set(username, result); return result;
  }
  async function read() {
    const current = await user(actors.farmer);
    const result = await current.context.request.get(`${base}/api/lots/${fixture.lotId}`, {headers: current.headers});
    if (result.status() === 404) return null;
    assert.equal(result.status(), 200); return result.json();
  }
  function saved(lot, eventType) {
    assert.equal(lot.events.at(-1).eventType, eventType); assert.match(lot.lastEventId, /^[a-f0-9]{64}$/);
    evidence.uiCommits.push({eventType, txId: lot.lastEventId, status: lot.status, source: 'NATIVE_UI'});
  }
  async function record(session, lot, type, fields) {
    const endpoint = `${base}/api/lots/${lot.lotId}/${type}`;
    const previous = await (await session.context.request.get(endpoint, {headers: session.headers})).json();
    if (previous.items.some(item => item.data.note === 'TC-LIVE-V1-UI')) return;
    const {page} = session;
    await page.goto(`${base}/lots/${lot.lotId}`);
    const panel = page.locator('section.panel').filter({has: page.getByRole('heading', {name: 'Hồ sơ bổ sung', exact: true})});
    await panel.getByLabel('Loại hồ sơ').selectOption(type);
    await panel.getByLabel('Thời điểm', {exact: true}).fill('2026-11-15T07:00');
    for (const [label, value] of Object.entries(fields)) {
      const input = panel.getByLabel(label, {exact: label !== 'Kết quả'});
      if (label === 'Kết quả') await input.selectOption(value); else await input.fill(value);
    }
    await panel.getByLabel('Ghi chú', {exact: true}).fill('TC-LIVE-V1-UI');
    const response = page.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
    await panel.getByRole('button', {name: 'Lưu hồ sơ', exact: true}).click();
    assert.equal((await response).status(), 201);
    (evidence.offChainRecords ||= []).push({lotId: lot.lotId, type, source: 'NATIVE_UI'});
  }
  try {
    let lot = await read(), beforeCount = lot?.events.length || 0;
    if (!lot) {
      const {page} = await user(actors.farmer); await page.goto(base + '/lots/new');
      for (const [label, key] of [['Mã lô', 'lotId'], ['Tên sản phẩm', 'productName'], ['Nguồn gốc', 'origin'], ['Ngày thu hoạch theo hồ sơ lô', 'harvestDate'], ['Địa điểm ghi nhận', 'location']]) await page.getByLabel(label, {exact: true}).fill(fixture.input[key]);
      await page.getByLabel('Doanh nghiệp sơ chế').selectOption(fixture.input.processorOrganizationId);
      await page.getByLabel('Doanh nghiệp phân phối').selectOption(fixture.input.distributorOrganizationId);
      const response = page.waitForResponse(r => r.url().endsWith('/api/lots') && r.request().method() === 'POST');
      await page.getByRole('button', {name: 'Tạo lô', exact: true}).click();
      const result = await response; assert.equal(result.status(), 201); lot = await result.json(); saved(lot, 'CTE_CREATE');
    }
    assert.deepEqual(lot.events.map(event => event.eventType), expected.slice(0, lot.events.length), 'Unexpected history preserved; do not resubmit');
    const steps = [
      [actors.farmer, 'CTE_HARVEST'], [actors.farmer, 'CTE_HANDOVER_PROCESSOR'],
      [actors.processor, 'CTE_RECEIVE_PROCESSOR'], [actors.processor, 'CTE_PROCESS'], [actors.processor, 'CTE_HANDOVER_SHIP'],
      [actors.transporter, 'CTE_RECEIVE_SHIP'], [actors.transporter, 'CTE_TRANSPORT'], [actors.transporter, 'CTE_HANDOVER_RETAIL'],
      [actors.distributor, 'CTE_DISPATCH_RETAIL'], [actors.distributor, 'CTE_DISPLAY_SALE'],
    ];
    for (const [username, type] of steps) {
      if (lot.events.some(event => event.eventType === type)) continue;
      const session = await user(username), {page} = session;
      if (live && type === 'CTE_HANDOVER_RETAIL') await record(session, lot, 'transport-logs', {'Vị trí': 'Kho lạnh Cần Thơ · mô phỏng', 'Nhiệt độ (°C)': '8.2', 'Độ ẩm (%)': '72'});
      await page.goto(`${base}/lots/${fixture.lotId}`); await page.locator('.page-heading h1').waitFor();
      await page.locator('.page-heading .actions button').first().click();
      const dialog = page.getByRole('dialog'); await dialog.getByLabel('Loại sự kiện').selectOption(type);
      await dialog.getByLabel('Địa điểm ghi nhận', {exact: true}).fill('Diễn tập bảo vệ · Tiền Giang → TP.HCM');
      if (['CTE_HARVEST', 'CTE_PROCESS', 'CTE_DISPATCH_RETAIL'].includes(type)) await dialog.getByLabel('Khối lượng / Số lượng', {exact: true}).fill(type === 'CTE_HARVEST' ? '100' : '95');
      if (live && type === 'CTE_HARVEST') {
        await dialog.getByLabel('Chứng từ PDF / ảnh (không bắt buộc)', {exact: true}).setInputFiles({name: `${fixture.lotId}-synthetic.pdf`, mimeType: 'application/pdf', buffer: fs.readFileSync(path.join(root, 'reports/live-demo-document.pdf'))});
        await dialog.getByText('Đã tải chứng từ, sẽ liên kết khi sự kiện được xác nhận.', {exact: true}).waitFor();
      }
      if (['CTE_PROCESS', 'CTE_DISPLAY_SALE'].includes(type)) await dialog.getByLabel('Kết quả kiểm tra chất lượng').selectOption('PASS');
      if (type === 'CTE_TRANSPORT') { await dialog.getByLabel('Nhiệt độ (°C)', {exact: true}).fill('8.2'); await dialog.getByLabel('Độ ẩm (%)', {exact: true}).fill('72'); }
      if (type === 'CTE_HANDOVER_SHIP') {
        const organizations = await (await session.context.request.get(base + '/api/business-organizations', {headers: session.headers})).json();
        await dialog.getByLabel('Bên nhận bàn giao').selectOption(organizations.find(item => item.code === 'TC-DEMO-V1-VC').organizationId);
      }
      await dialog.getByRole('checkbox').check();
      const response = page.waitForResponse(r => r.url().includes(`/api/lots/${fixture.lotId}/`) && r.request().method() === 'POST');
      const previousCount = lot.events.length;
      await dialog.getByRole('button', {name: 'Xác nhận gửi sự kiện', exact: true}).click();
      const result = await response; assert.equal(result.status(), 201, `UI event ${type} failed`);
      lot = await result.json(); assert.equal(lot.events.length, previousCount + 1); saved(lot, type);
      if (live) {
        if (type === 'CTE_HARVEST') await record(session, lot, 'cultivation-logs', {'Hoạt động canh tác': 'Kiểm tra sâu bệnh · dữ liệu mô phỏng'});
        if (type === 'CTE_PROCESS') await record(session, lot, 'quality-checks', {'Kết quả': 'PASS'});
        if (type === 'CTE_TRANSPORT') await record(session, lot, 'transport-logs', {'Vị trí': 'Kho lạnh Cần Thơ · mô phỏng', 'Nhiệt độ (°C)': '8.2', 'Độ ẩm (%)': '72'});
      }
      if (['CTE_HANDOVER_PROCESSOR', 'CTE_RECEIVE_PROCESSOR', 'CTE_HANDOVER_SHIP', 'CTE_RECEIVE_SHIP', 'CTE_HANDOVER_RETAIL', 'CTE_DISPATCH_RETAIL'].includes(type)) {
        const duplicate = await session.context.request.post(result.url(), {headers: session.headers, data: result.request().postDataJSON()});
        assert.equal(duplicate.status(), 409); const denial = await duplicate.json(); assert.match(denial.message, /current lot state/);
        const after = await read(); assert.deepEqual(after.events, lot.events); assert.equal(after.status, lot.status); assert.equal(after.currentHolderOrganizationId, lot.currentHolderOrganizationId);
        evidence.rejections.push({eventType: type, status: 409, reason: denial.message, historyUnchanged: true, source: 'LIVE_API'});
      }
    }
    assert.equal(lot.status, 'READY_FOR_SALE'); assert.equal(lot.events.length, 11);
    if (live) {
      const session = await user(actors.farmer), {page} = session;
      await record(session, lot, 'cultivation-logs', {'Hoạt động canh tác': 'Kiểm tra sâu bệnh · dữ liệu mô phỏng'});
      await record(await user(actors.processor), lot, 'quality-checks', {'Kết quả': 'PASS'});
      await page.goto(`${base}/lots/${fixture.lotId}`);
      await page.getByRole('button', {name: 'Tải và đối soát chứng từ', exact: true}).click();
      await page.getByText('Hash file khớp với hash sự kiện.', {exact: true}).waitFor();
      const download = page.waitForEvent('download');
      await page.getByRole('button', {name: 'Tải xuống', exact: true}).click();
      const downloaded = await download;
      assert.equal(await downloaded.failure(), null);
      assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(await downloaded.path())).digest('hex'), fixture.documentHash);
      evidence.documentUploadDownload = 'PASS';
      const docs = await (await session.context.request.get(`${base}/api/lots/${fixture.lotId}/verify-documents`, {headers: session.headers})).json();
      assert.equal(docs.valid, true); assert.equal(docs.documents[0].eventId, lot.events[1].eventId);
      evidence.documentAnchoredToHarvest = 'PASS';
      let recalled = await (await session.context.request.get(`${base}/api/lots/${fixture.recallLotId}`, {headers: session.headers})).json();
      if (recalled.status !== 'RECALLED') {
        await page.goto(`${base}/lots/${fixture.recallLotId}`);
        await page.getByRole('button', {name: 'Thu hồi lô', exact: true}).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Địa điểm ghi nhận', {exact: true}).fill('Khu cách ly demo');
        await dialog.getByLabel('Lý do thu hồi', {exact: true}).fill('Thu hồi mô phỏng để kiểm tra thao tác trước bảo vệ');
        await dialog.getByRole('checkbox').check();
        const response = page.waitForResponse(r => r.url().includes(`/api/lots/${fixture.recallLotId}/`) && r.request().method() === 'POST');
        await dialog.getByRole('button', {name: 'Xác nhận gửi sự kiện', exact: true}).click();
        const result = await response; assert.equal(result.status(), 201); recalled = await result.json();
        (evidence.recallCommits ||= []).push({lotId: recalled.lotId, txId: recalled.lastEventId, source: 'NATIVE_UI'});
      }
      assert.equal(recalled.status, 'RECALLED');
      await record(session, recalled, 'incidents', {'Loại sự cố': 'Chất lượng', 'Mô tả': 'Cách ly mô phỏng sau thu hồi'});
      const denied = await session.context.request.post(`${base}/api/lots/${fixture.recallLotId}/events`, {headers: session.headers, data: {eventType: 'CTE_HARVEST', previousEventId: recalled.lastEventId, location: 'QA', data: {quantity: 10, unit: 'kg'}}});
      assert.equal(denied.status(), 409);
      const after = await (await session.context.request.get(`${base}/api/lots/${fixture.recallLotId}`, {headers: session.headers})).json();
      assert.deepEqual(after.events, recalled.events);
      evidence.recallBlocksFurtherEvents = 'PASS';
    }
    const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}), page = await context.newPage();
    const apiRequests = [];
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push({origin: new URL(request.url()).origin, authenticated: Boolean(request.headers().authorization)}); });
    await page.goto(`${base}/trace/${fixture.lotId}`);
    await page.getByRole('heading', {name: fixture.input.productName, exact: true}).waitFor();
    await page.getByRole('heading', {name: 'Lịch sử hợp lệ trong phạm vi kiểm tra', exact: true}).waitFor();
    assert.equal(await page.locator('.timeline article').count(), 11); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(apiRequests.length); assert.ok(apiRequests.every(request => request.origin === base && !request.authenticated));
    const qr = await context.request.get(`${base}/api/lots/${fixture.lotId}/qr`); assert.equal(qr.status(), 200); assert.equal(qr.headers()['cache-control'], 'no-store');
    const {PNG} = require('pngjs'), pixels = PNG.sync.read(await qr.body());
    const decoded = require('jsqr')(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height); assert.ok(decoded);
    assert.equal(decoded.data, fixture.qrUrl);
    assert.match(decoded.data, new RegExp(`/trace/${fixture.lotId}$`)); assert.ok(!['localhost', '127.0.0.1'].includes(new URL(decoded.data).hostname));
    evidence.qrUrl = decoded.data; evidence.publicMobile = 'PASS'; evidence.phone = 'NOT VERIFIED'; evidence.sameOriginApi = 'PASS';
    if (live) {
      await page.goto(`${base}/trace/${fixture.recallLotId}`);
      await page.getByText(/CẢNH BÁO: Lô hàng đã bị thu hồi/).waitFor();
      evidence.publicRecallWarning = 'PASS';
      assert.ok(evidence.uiCommits.length === 11 && evidence.rejections.length === 6, 'Expected native creation and all ten events plus six replay rejections');
    }
    evidence.runs.push({checkedAt: new Date().toISOString(), beforeEvents: beforeCount, afterEvents: 11, addedEvents: 11 - beforeCount});
    delete evidence.error;
    console.log(JSON.stringify({lotId: fixture.lotId, events: 11, addedEvents: 11 - beforeCount, nativeUi: 'PASS', qrUrl: decoded.data}));
  } catch (error) { evidence.error = safe(error.message); throw error; }
  finally { await browser.close(); fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n'); }
}
main().catch(error => {console.error(safe(error.message)); process.exitCode = 1;});
