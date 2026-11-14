// Rehearse only the dedicated lot; credentials stay in memory and existing lots are never advanced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'reports/rehearsal-browser-20261117.json');
let password = '';
const safe = message => password ? String(message).split(password).join('[REDACTED]') : String(message);
async function main() {
  assert.equal(process.env.DEMO_DATA_ENABLED, 'true', 'Explicit DEMO_DATA_ENABLED=true required for live rehearsal');
  if (process.env.TRACECHAIN_REHEARSAL_BROWSER !== 'true') {
    password = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, '.env'))).DEMO_PASSWORD;
    assert.ok(password?.length >= 12);
    const modules = path.dirname(path.dirname(require.resolve('playwright/package.json')));
    const result = spawnSync('docker', ['run', '--rm', '--network', 'container:tracechain-frontend', '--shm-size=256m',
      '-e', 'DEMO_PASSWORD', '-e', 'DEMO_DATA_ENABLED=true', '-e', 'TRACECHAIN_REHEARSAL_BROWSER=true', '-e', 'NODE_PATH=/tools/node_modules',
      '-v', `${modules}:/tools/node_modules:ro`, '-v', `${__filename}:/work/scripts/rehearsal-browser.js:ro`,
      '-v', `${path.join(root, 'reports')}:/work/reports`, 'mcr.microsoft.com/playwright:v1.65.0-noble', 'node', '/work/scripts/rehearsal-browser.js'],
      {env: {...process.env, DEMO_PASSWORD: password}, stdio: 'inherit'});
    assert.equal(result.status, 0, 'Browser rehearsal failed; see its sanitized JSON evidence');
    return;
  }
  password = process.env.DEMO_PASSWORD;
  const fixture = JSON.parse(fs.readFileSync(path.join(root, 'reports/rehearsal-20261117.json'), 'utf8'));
  const evidence = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {lotId: fixture.lotId, uiCommits: [], rejections: [], runs: []};
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
    const current = await user('tc_rehearsal_farm_a');
    const result = await current.context.request.get(`${base}/api/lots/${fixture.lotId}`, {headers: current.headers});
    if (result.status() === 404) return null;
    assert.equal(result.status(), 200); return result.json();
  }
  function saved(lot, eventType) {
    assert.equal(lot.events.at(-1).eventType, eventType); assert.match(lot.lastEventId, /^[a-f0-9]{64}$/);
    evidence.uiCommits.push({eventType, txId: lot.lastEventId, status: lot.status, source: 'NATIVE_UI'});
  }
  try {
    let lot = await read(), beforeCount = lot?.events.length || 0;
    if (!lot) {
      const {page} = await user('tc_rehearsal_farm_a'); await page.goto(base + '/lots/new');
      for (const [label, key] of [['Mã lô', 'lotId'], ['Tên sản phẩm', 'productName'], ['Nguồn gốc', 'origin'], ['Ngày thu hoạch theo hồ sơ lô', 'harvestDate'], ['Địa điểm ghi nhận', 'location']]) await page.getByLabel(label, {exact: true}).fill(fixture.input[key]);
      await page.getByLabel('Doanh nghiệp sơ chế').selectOption(fixture.input.processorOrganizationId);
      await page.getByLabel('Doanh nghiệp phân phối').selectOption(fixture.input.distributorOrganizationId);
      const response = page.waitForResponse(r => r.url().endsWith('/api/lots') && r.request().method() === 'POST');
      await page.getByRole('button', {name: 'Tạo lô', exact: true}).click();
      const result = await response; assert.equal(result.status(), 201); lot = await result.json(); saved(lot, 'CTE_CREATE');
    }
    assert.deepEqual(lot.events.map(event => event.eventType), expected.slice(0, lot.events.length), 'Unexpected history preserved; do not resubmit');
    const steps = [
      ['tc_rehearsal_farm_a', 'CTE_HARVEST'], ['tc_rehearsal_farm_a', 'CTE_HANDOVER_PROCESSOR'],
      ['tc_nv_soche01', 'CTE_RECEIVE_PROCESSOR'], ['tc_nv_soche01', 'CTE_PROCESS'], ['tc_nv_soche01', 'CTE_HANDOVER_SHIP'],
      ['tc_nv_vanchuyen01', 'CTE_RECEIVE_SHIP'], ['tc_nv_vanchuyen01', 'CTE_TRANSPORT'], ['tc_nv_vanchuyen01', 'CTE_HANDOVER_RETAIL'],
      ['tc_nv_phanphoi01', 'CTE_DISPATCH_RETAIL'], ['tc_nv_phanphoi01', 'CTE_DISPLAY_SALE'],
    ];
    for (const [username, type] of steps) {
      if (lot.events.some(event => event.eventType === type)) continue;
      const session = await user(username), {page} = session;
      await page.goto(`${base}/lots/${fixture.lotId}`); await page.locator('.page-heading h1').waitFor();
      await page.locator('.page-heading .actions button').first().click();
      const dialog = page.getByRole('dialog'); await dialog.getByLabel('Loại sự kiện').selectOption(type);
      await dialog.getByLabel('Địa điểm ghi nhận', {exact: true}).fill('Diễn tập bảo vệ · Tiền Giang → TP.HCM');
      if (['CTE_HARVEST', 'CTE_PROCESS', 'CTE_DISPATCH_RETAIL'].includes(type)) await dialog.getByLabel('Khối lượng / Số lượng', {exact: true}).fill(type === 'CTE_HARVEST' ? '100' : '95');
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
      if (['CTE_HANDOVER_PROCESSOR', 'CTE_RECEIVE_PROCESSOR', 'CTE_HANDOVER_SHIP', 'CTE_RECEIVE_SHIP', 'CTE_HANDOVER_RETAIL', 'CTE_DISPATCH_RETAIL'].includes(type)) {
        const duplicate = await session.context.request.post(result.url(), {headers: session.headers, data: result.request().postDataJSON()});
        assert.equal(duplicate.status(), 409); const denial = await duplicate.json(); assert.match(denial.message, /current lot state/);
        const after = await read(); assert.deepEqual(after.events, lot.events); assert.equal(after.status, lot.status); assert.equal(after.currentHolderOrganizationId, lot.currentHolderOrganizationId);
        evidence.rejections.push({eventType: type, status: 409, reason: denial.message, historyUnchanged: true, source: 'LIVE_API'});
      }
    }
    assert.equal(lot.status, 'READY_FOR_SALE'); assert.equal(lot.events.length, 11);
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
    evidence.runs.push({checkedAt: new Date().toISOString(), beforeEvents: beforeCount, afterEvents: 11, addedEvents: 11 - beforeCount});
    delete evidence.error;
    console.log(JSON.stringify({lotId: fixture.lotId, events: 11, addedEvents: 11 - beforeCount, nativeUi: 'PASS', qrUrl: decoded.data}));
  } catch (error) { evidence.error = safe(error.message); throw error; }
  finally { await browser.close(); fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n'); }
}
main().catch(error => {console.error(safe(error.message)); process.exitCode = 1;});
