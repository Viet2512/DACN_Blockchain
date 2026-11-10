// Read-only LAN/QR checks: no login, seed, business mutation, or credentials passed to the browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function main() {
  if (process.env.TRACECHAIN_LAN_BROWSER_WORKER !== 'true') {
    const origin = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(root, '.env'))).PUBLIC_BASE_URL;
    const modules = path.dirname(path.dirname(require.resolve('playwright/package.json')));
    const result = spawnSync('docker', ['run', '--rm', '--network', 'host', '--shm-size=512m',
      '-e', 'PUBLIC_BASE_URL', '-e', 'TRACECHAIN_LAN_BROWSER_WORKER=true', '-e', 'NODE_PATH=/tools/node_modules',
      '-v', `${modules}:/tools/node_modules:ro`,
      '-v', `${__filename}:/work/scripts/lan-browser.js:ro`,
      '-v', `${path.join(root, 'reports')}:/work/reports`,
      'mcr.microsoft.com/playwright:v1.65.0-noble', 'node', '/work/scripts/lan-browser.js'],
      {env: {...process.env, PUBLIC_BASE_URL: origin}, stdio: 'inherit'});
    assert.equal(result.status, 0, 'LAN browser checks failed; inspect reports/lan-qr.json');
    return;
  }
  const {chromium} = require('playwright');
  const jsQR = require('jsqr');
  const {PNG} = require('pngjs');
  const origin = process.env.PUBLIC_BASE_URL;
  const report = {checkedAt: new Date().toISOString(), origin, checks: [], errors: [], physicalPhone: 'NOT VERIFIED', windowsFirewall: 'NOT APPLIED: requires Administrator and trusted Private network'};
  const browser = await chromium.launch({headless: true});
  try {
    assert.notEqual(new URL(origin).hostname, 'localhost');
    assert.notEqual(new URL(origin).hostname, '127.0.0.1');
    for (const address of ['http://localhost:3001', origin]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requests = [];
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('request', request => {if (request.url().includes('/api/')) requests.push({url: request.url(), authorization: Boolean(request.headers().authorization)});});
      for (const width of [390, 1440]) {
        await page.setViewportSize({width, height: 900});
        await page.goto(address + '/trace/TC-DEMO-V1-001');
        await page.getByRole('heading', {name: 'Xoài Cát Hòa Lộc', exact: true}).waitFor();
        await page.getByRole('heading', {name: 'Lịch sử hợp lệ trong phạm vi kiểm tra', exact: true}).waitFor();
        assert.equal(await page.locator('.timeline article').count(), 11);
        assert.equal(await page.getByRole('alert').count(), 0);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.ok(await page.getByText('HTX Nông Sản Miền Tây', {exact: true}).count());
        report.checks.push({address, width, publicTrace: 'PASS', timelineEvents: 11});
      }
      assert.ok(requests.length);
      assert.ok(requests.every(request => new URL(request.url).origin === address && !request.authorization));
      assert.equal((await context.request.get(address + '/api/users')).status(), 401);
      assert.equal((await context.request.get(address + '/api/public/trace/UNKNOWN-LAN-LOT')).status(), 404);
      const png = await context.request.get(address + '/api/lots/TC-DEMO-V1-001/qr');
      assert.equal(png.status(), 200); assert.equal(png.headers()['cache-control'], 'no-store');
      const buffer = await png.body(), pixels = PNG.sync.read(buffer);
      const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
      assert.ok(decoded, 'QR PNG could not be decoded');
      assert.equal(decoded.data, origin + '/trace/TC-DEMO-V1-001');
      assert.equal(new URL(decoded.data).search, ''); assert.equal(new URL(decoded.data).hash, '');
      fs.writeFileSync(path.join(root, 'reports/tracechain-lan-qr.png.tmp'), buffer);
      fs.renameSync(path.join(root, 'reports/tracechain-lan-qr.png.tmp'), path.join(root, 'reports/tracechain-lan-qr.png'));
      report.checks.push({address, pngDecodedUrl: decoded.data, sameOriginApi: 'PASS', anonymousAdminDenied: 401});
      await page.goto(decoded.data);
      await page.getByRole('heading', {name: 'Xoài Cát Hòa Lộc', exact: true}).waitFor();
      const publicData = await (await context.request.get(address + '/api/public/trace/TC-DEMO-V1-001')).json();
      assert.equal(publicData.source, 'FABRIC'); assert.equal(publicData.integrity.valid, true);
      const content = JSON.stringify(publicData);
      for (const privateField of ['privateKey', 'password', 'userId', 'signerId', 'certificateReference']) assert.ok(!content.includes(privateField));
      await page.goto(address + '/trace/TC-DEMO-V1-022');
      await page.getByRole('alert').filter({hasText: 'Lô hàng đã bị thu hồi'}).waitFor();
      await context.close();
    }
    assert.deepEqual(report.errors, []);
    console.log(JSON.stringify({checks: report.checks.length, qrUrl: origin + '/trace/TC-DEMO-V1-001', browser: 'PASS', physicalPhone: 'NOT VERIFIED'}));
  } catch (error) {report.errors.push(error.message); throw error;}
  finally {
    await browser.close();
    fs.writeFileSync(path.join(root, 'reports/lan-qr.json.tmp'), JSON.stringify(report, null, 2) + '\n');
    fs.renameSync(path.join(root, 'reports/lan-qr.json.tmp'), path.join(root, 'reports/lan-qr.json'));
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
