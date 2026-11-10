// Credentials stay in process memory; never enable traces or capture login forms.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const data = require('../backend/demo-data');
const base = 'http://localhost:3001';
let password = '';
const safeMessage = message => password ? String(message).split(password).join('[REDACTED]') : String(message);
const report = {checkedAt: new Date().toISOString(), pages: [], errors: [], checks: {}};
async function main() {
  if (process.env.TRACECHAIN_BROWSER_WORKER !== 'true') {
  const configured = spawnSync('docker', ['exec', 'tracechain-backend', 'node', '-e', "if(process.env.NODE_ENV!=='development')process.exit(1);process.stdout.write(process.env.DEMO_PASSWORD || '')"], {encoding: 'utf8'});
  assert.equal(configured.status, 0, 'Browser demo tests require the development backend');
  password = configured.stdout;
  assert.ok(password.length >= 12, 'Demo credentials not configured');
  const root = path.resolve(__dirname, '..');
  const modules = path.dirname(path.dirname(require.resolve('playwright/package.json')));
  const result = spawnSync('docker', ['run', '--rm', '--network', 'host', '--ipc=host',
    '-e', 'DEMO_PASSWORD', '-e', 'TRACECHAIN_BROWSER_WORKER=true', '-e', 'NODE_PATH=/tools/node_modules',
    '-v', `${modules}:/tools/node_modules:ro`,
    '-v', `${path.join(root, 'scripts/demo-browser.js')}:/work/scripts/demo-browser.js:ro`,
    '-v', `${path.join(root, 'backend/demo-data.js')}:/work/backend/demo-data.js:ro`,
    '-v', `${path.join(root, 'reports')}:/work/reports`,
    'mcr.microsoft.com/playwright:v1.65.0-noble', 'node', '/work/scripts/demo-browser.js'],
    {env: {...process.env, DEMO_PASSWORD: password}, stdio: 'inherit'});
  assert.equal(result.status, 0, 'Browser container failed; see reports/demo-browser.json');
  return;
  }
  password = process.env.DEMO_PASSWORD;
  const {chromium} = require('playwright');
  const browser = await chromium.launch({headless: true});
  try {
    for (const user of data.users) {
      const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({username: user.username, message: safeMessage(error.message)}));
      page.on('console', message => {if (message.type() === 'error' && !message.text().includes('403')) report.errors.push({username: user.username, message: safeMessage(message.text())});});
      await page.goto(`${base}/login`);
      await page.getByLabel('Tên đăng nhập', {exact: true}).fill(user.username);
      await page.getByLabel('Mật khẩu', {exact: true}).fill(password);
      await page.getByRole('button', {name: 'Đăng nhập →', exact: true}).click();
      await page.waitForURL(`**/${user.role.toLowerCase()}/dashboard`);
      await page.getByRole('heading', {name: /Tổng quan/}).waitFor();
      await page.locator('.stats').waitFor();
      const navigation = await page.getByRole('navigation', {name: 'Điều hướng chính'}).innerText();
      assert.equal(navigation.includes('Nhân viên'), user.role === 'BUSINESS_ADMIN');
      assert.equal(navigation.includes('Doanh nghiệp & người dùng'), user.role === 'SUPER_ADMIN');
      const routes = ['/lots', '/handovers', '/history', '/recalls', '/profile'];
      if (user.role === 'SUPER_ADMIN') routes.push('/admin/organizations', '/admin/users', '/admin/roles', '/admin/verification', '/admin/blockchain', '/admin/fabric-organizations', '/admin/fabric-identities', '/admin/audit-logs', '/admin/reports');
      if (user.role === 'BUSINESS_ADMIN') routes.push('/business/staff', '/business/activity', '/business/organization');
      if (user.role === 'FARMER') routes.push('/lots/new');
      if (['PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'].includes(user.role)) routes.push('/work');
      for (const route of routes) {
        await page.goto(base + route);
        await page.waitForLoadState('networkidle');
        assert.ok(await page.locator('h1').count(), `Blank page: ${user.username} ${route}`);
        assert.equal(await page.getByRole('heading', {name: 'Không có quyền truy cập', exact: true}).count(), 0, `${user.username} ${route}`);
        assert.equal(await page.getByRole('alert').count(), 0, `API/form error: ${user.username} ${route}`);
        for (const width of [1440, 390]) {
          await page.setViewportSize({width, height: 1000});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow: ${user.username} ${route} ${width}`);
        }
        await page.setViewportSize({width: 1440, height: 1000});
        report.pages.push({username: user.username, role: user.role, route, desktop: 'PASS', mobile: 'PASS'});
      }
      await page.goto(`${base}/lots`); await page.waitForLoadState('networkidle');
      await page.getByRole('searchbox').fill('TC-DEMO-V1');
      assert.ok(await page.getByRole('link', {name: /TC-DEMO-V1/}).count(), `No seeded lots: ${user.username}`);
      if (['tc_nv_sanxuat01', 'tc_nv_soche01'].includes(user.username)) {
        await page.goto(`${base}/lots/TC-DEMO-V1-007`); await page.waitForLoadState('networkidle');
        const before = await page.evaluate(async () => (await fetch('/api/lots/TC-DEMO-V1-007', {headers: {Authorization: `Bearer ${sessionStorage.getItem('tracechain-token')}`}})).json());
        const sending = user.role === 'FARMER';
        if (before.status === (sending ? 'HARVESTED' : 'WAITING_PROCESSOR')) {
          await page.getByRole('button', {name: sending ? 'Giao sang sơ chế' : 'Sơ chế xác nhận nhận', exact: true}).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Địa điểm ghi nhận', {exact: true}).fill('Địa điểm demo kiểm thử trình duyệt · Tiền Giang');
          await dialog.getByRole('checkbox').check();
          const response = page.waitForResponse(response => response.url().includes('/lots/TC-DEMO-V1-007/handover/') && response.request().method() === 'POST');
          await dialog.getByRole('button', {name: 'Xác nhận gửi sự kiện', exact: true}).click();
          const saved = await response; assert.equal(saved.status(), 201);
          const after = await saved.json();
          assert.equal(after.status, sending ? 'WAITING_PROCESSOR' : 'RECEIVED_PROCESSOR');
          assert.equal(after.events.length, before.events.length + 1);
          assert.match(after.lastEventId, /^[a-f0-9]{64}$/);
          report.checks[sending ? 'nativeHandoverRequest' : 'nativeHandoverConfirmation'] = {status: 'PASS', lotId: after.lotId, transactionId: after.lastEventId};
        } else assert.equal(before.status, 'RECEIVED_PROCESSOR', 'Unexpected E2E lot state; do not advance another demo lot');
      }
      await page.setViewportSize({width: 390, height: 844});
      await page.getByRole('button', {name: 'Mở hoặc đóng điều hướng'}).click();
      const backdrop = page.getByRole('button', {name: 'Đóng điều hướng', exact: true});
      const bounds = await backdrop.boundingBox();
      await backdrop.click({position: {x: bounds.width - 8, y: 40}});
      assert.equal(await page.getByRole('button', {name: 'Mở hoặc đóng điều hướng'}).getAttribute('aria-expanded'), 'false');
      await page.setViewportSize({width: 1440, height: 1000});
      if (user.role !== 'SUPER_ADMIN') {
        await page.goto(`${base}/admin/users`);
        await page.getByRole('heading', {name: 'Không có quyền truy cập', exact: true}).waitFor();
      }
      await page.goto(`${base}/profile`); await page.waitForLoadState('networkidle');
      await page.getByRole('button', {name: 'Đăng xuất', exact: true}).click();
      await page.waitForURL('**/login');
      await context.close();
      console.log(`Browser ${user.username}: PASS`);
    }
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await context.newPage();
    await page.goto(`${base}/trace/TC-DEMO-V1-001`);
    await page.getByRole('heading', {name: data.products[0].name, exact: true}).waitFor();
    await page.waitForLoadState('networkidle');
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    report.checks.publicTraceWithoutSession = 'PASS';
    await context.close();
    assert.deepEqual(report.errors, []);
    report.checks.all13NativeLoginsRoutesAndResponsive = 'PASS';
  } finally {await browser.close();}
}
main().catch(error => {const message=safeMessage(error.message);console.error(message); report.errors.push({message}); process.exitCode = 1;}).finally(() => {
  if (process.env.TRACECHAIN_BROWSER_WORKER !== 'true') return;
  fs.writeFileSync(path.join(__dirname, '../reports/demo-browser.json'), JSON.stringify(report, null, 2) + '\n');
});
