require('dotenv').config({quiet: true});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const data = require('./demo-data');
const workflow = require('../chaincode/src/workflow');
const fabric = require('./fabric');
const API = process.env.API_URL || 'http://localhost:8080/api';
const tokens = {}, accounts = {}, companies = {};
const report = {dataset: data.dataset, checkedAt: new Date().toISOString(), created: {organizations: 0, accounts: 0, lots: 0, events: 0}, skipped: 0, reconciled: 0, errors: [], lots: [], checks: {}};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertDemoEnvironment(env = process.env) {
  assert.ok(['development', 'test'].includes(env.NODE_ENV), 'Demo writes require NODE_ENV=development/test');
  assert.equal(env.DEMO_DATA_ENABLED, 'true', 'Demo writes require explicit DEMO_DATA_ENABLED=true');
  assert.equal(env.MYSQL_ENABLED, 'true', 'MySQL must be enabled');
  assert.equal(env.FABRIC_ENABLED, 'true', 'Real Fabric must be enabled');
  assert.ok(env.MYSQL_DATABASE && env.ADMIN_USERNAME && env.ADMIN_PASSWORD, 'Database and administrator configuration required');
  assert.ok(env.DEMO_PASSWORD?.length >= 12 && env.DEMO_PASSWORD.length <= 1024, 'Set DEMO_PASSWORD to 12–1024 characters in private environment');
  const endpoint = new URL(env.API_URL || API);
  assert.ok(['localhost', '127.0.0.1', 'backend'].includes(endpoint.hostname), 'Demo runner only targets the local application');
}
async function call(endpoint, token, method = 'GET', body) {
  const response = await fetch(API + endpoint, {method, signal: AbortSignal.timeout(90000), headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw Object.assign(new Error(`${method} ${endpoint}: HTTP ${response.status} (${result?.code || 'REQUEST_FAILED'})`), {status: response.status, receipt: result});
  return result;
}
async function login(username, password = process.env.DEMO_PASSWORD) {
  const session = await call('/auth/login', null, 'POST', {username, password});
  tokens[username] = session.token; accounts[username] = session.user;
  return session.token;
}
const staff = (role, index) => data.users.find(user => user.role === role && user.username.endsWith(`0${index}`)).username;
function checkAccount(expected, actual, organizationId) {
  assert.equal(actual.role, expected.role, `Account collision: ${expected.username}`);
  assert.equal(actual.organizationId || null, organizationId || null, `Organization collision: ${expected.username}`);
  assert.equal(actual.status, 'ACTIVE', `Disabled account retained: ${expected.username}`);
  assert.equal(actual.email, expected.email, `Non-demo account collision: ${expected.username}`);
}
async function loadCompanies(admin, create) {
  const current = await call('/business-organizations', admin);
  for (const sample of data.organizations) {
    let row = current.find(row => row.code === sample.code);
    if (!row && create) {row = await call('/business-organizations', admin, 'POST', sample); report.created.organizations++;}
    assert.ok(row, `Missing organization ${sample.code}`);
    assert.equal(row.type, sample.type); assert.equal(row.mspId, sample.mspId); assert.equal(row.status, 'ACTIVE');
    companies[sample.code] = row.organizationId;
  }
}
async function prepareAccounts(admin) {
  await loadCompanies(admin, true);
  const current = await call('/users', admin);
  // Validate every existing account before creating any new accounts; never reset passwords.
  for (const sample of data.users) {
    const found = current.find(row => row.username === sample.username);
    if (found) {checkAccount(sample, found, companies[sample.organizationCode]); await login(sample.username);}
  }
  for (const sample of data.users) {
    if (!accounts[sample.username]) {
      await call('/users', admin, 'POST', {...sample, organizationId: companies[sample.organizationCode], password: process.env.DEMO_PASSWORD});
      report.created.accounts++; await login(sample.username);
    } else report.skipped++;
  }
  const requests = await call('/fabric-identity-requests', admin);
  for (const sample of data.users.filter(user => workflow.msps[user.role])) {
    const account = accounts[sample.username];
    if (account.fabricIdentityStatus === 'ACTIVE') continue;
    assert.equal(account.fabricIdentityStatus, 'PENDING', `Do not reactivate disabled signer: ${sample.username}`);
    const request = requests.find(row => row.userId === account.userId);
    assert.notEqual(request?.status, 'DISABLED', `Do not reactivate disabled request: ${sample.username}`);
    if (!request) await call(`/users/${sample.username}/fabric-identity/request`, tokens[sample.username], 'POST', {});
    if (!request || ['PENDING', 'FAILED'].includes(request.status)) await call(`/users/${sample.username}/fabric-identity/issue`, admin, 'POST', {});
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    const statuses = await call('/users', admin);
    const staffUsers = statuses.filter(row => data.users.some(sample => sample.username === row.username && workflow.msps[sample.role]));
    if (staffUsers.length === 8 && staffUsers.every(row => row.fabricIdentityStatus === 'ACTIVE')) return;
    const requests = await call('/fabric-identity-requests', admin);
    assert.ok(!requests.some(row => staffUsers.some(user => user.userId === row.userId) && row.status === 'FAILED'), 'CA issuance failed; inspect operator logs, do not bypass certificate checks');
    await pause(2000);
  }
  throw new Error('Signer issuance timed out; rerun seed after CA operator is healthy');
}
function checkLot(sample, lot) {
  assert.equal(lot.source, 'FABRIC'); assert.equal(lot.schemaVersion, 4);
  assert.equal(lot.productName, sample.product.name); assert.equal(lot.origin, sample.origin); assert.equal(lot.harvestDate, sample.harvestDate);
  assert.equal(lot.owner, accounts[staff('FARMER', sample.staffIndex)].userId);
  assert.equal(lot.ownerOrganizationId, companies[`${data.dataset}-SX`]);
  assert.equal(lot.processorOrganizationId, companies[`${data.dataset}-SC`]);
  assert.equal(lot.distributorOrganizationId, companies[`${data.dataset}-PP`]);
}
function missingSteps(sample, lot) {
  const expected = data.expectedTypes(sample);
  const actual = lot.events.map(event => event.eventType);
  if (actual.length >= expected.length && isDeepStrictEqual(actual.slice(0, expected.length), expected)) return [];
  assert.deepEqual(actual, expected.slice(0, actual.length), `Unexpected history ${sample.lotId}; preserved without writes`);
  return expected.slice(actual.length);
}
async function recover(sample, admin) {
  const ledger = await fabric.readLot(sample.lotId);
  checkLot(sample, {...ledger, source: 'FABRIC'});
  const lot = await call(`/fabric/lots/${sample.lotId}/reconcile`, admin, 'POST', {});
  report.reconciled++; return lot;
}
async function writeLot(sample, lot, type, admin) {
  const role = type === 'CTE_RECALL' ? 'FARMER' : workflow.rules[type][2];
  const username = staff(role, sample.staffIndex);
  const destination = {CTE_HANDOVER_PROCESSOR: 'SC', CTE_HANDOVER_SHIP: 'VC', CTE_HANDOVER_RETAIL: 'PP'}[type];
  const endpoint = workflow.requests.includes(type) ? 'handover/request' : workflow.confirmations.includes(type) ? 'handover/confirm' : type === 'CTE_RECALL' ? 'recall' : 'events';
  const payload = {eventType: type, previousEventId: lot.lastEventId, location: data.organizations.find(org => org.role === role).address, data: {note: `${data.dataset} · ${sample.product.code}`}};
  if (['CTE_HARVEST', 'CTE_PROCESS', 'CTE_DISPATCH_RETAIL'].includes(type)) Object.assign(payload.data, {quantity: sample.quantity - (type === 'CTE_HARVEST' ? 0 : 5), unit: sample.product.unit, date: sample.harvestDate});
  if (['CTE_PROCESS', 'CTE_DISPLAY_SALE'].includes(type)) payload.data.qualityResult = 'PASS';
  if (type === 'CTE_TRANSPORT') Object.assign(payload.data, {temperature: 12, humidity: 75});
  if (type === 'CTE_RECALL') payload.data.note = 'Thu hồi demo: cách ly để kiểm nghiệm bổ sung, không phải sản phẩm thực';
  if (destination) Object.assign(payload, {toOrganizationId: companies[`${data.dataset}-${destination}`], toRegion: 'TG-001'});
  try {return await call(`/lots/${sample.lotId}/${endpoint}`, tokens[username], 'POST', payload);}
  catch (error) {
    if (error.status && error.status < 500) throw error;
    // A timeout is not a failed commit: recover once, never blindly submit again.
    const recovered = await recover(sample, admin);
    if (recovered.events.length === lot.events.length + 1 && recovered.events.at(-1).eventType === type) return recovered;
    throw new Error(`Uncertain write ${sample.lotId}; inspect ledger before rerunning seed`);
  }
}
async function supportingRecords(sample, lot) {
  const types = lot.status === 'RECALLED' ? ['incidents'] : ['cultivation-logs', ...(lot.events.some(event => event.eventType === 'CTE_PROCESS') ? ['quality-checks'] : []), ...(lot.status === 'IN_TRANSIT' ? ['transport-logs'] : [])];
  for (const type of types) {
    const role = {'cultivation-logs': 'FARMER', 'quality-checks': 'PROCESSOR', 'transport-logs': 'TRANSPORTER', incidents: 'FARMER'}[type];
    const token = tokens[staff(role, sample.staffIndex)];
    const records = await call(`/lots/${lot.lotId}/${type}`, token);
    if (records.items.some(row => row.data.note === data.dataset)) continue;
    const details = {'cultivation-logs': {activity: `Chăm sóc vùng trồng · ${sample.product.code} · sản xuất từ 2026-10-01`}, 'quality-checks': {result: 'PASS'}, 'transport-logs': {location: 'QL1A · Cần Thơ → TP.HCM', temperature: 12, humidity: 75}, incidents: {type: 'QUALITY_ALERT', description: 'Cách ly demo, kiểm nghiệm bổ sung'}}[type];
    await call(`/lots/${lot.lotId}/${type}`, token, 'POST', {occurredAt: lot.events.at(-1).timestamp, note: data.dataset, ...details});
  }
}
async function seedLot(sample, admin) {
  let lot;
  try {lot = await call(`/lots/${sample.lotId}`, admin);}
  catch (error) {
    if (error.status !== 404) throw error;
    try {lot = await recover(sample, admin);}
    catch (ledgerError) {
      if (![ledgerError.message, ...(ledgerError.details || []).map(item => item.message)].some(message => /LOT_NOT_FOUND/.test(message))) throw ledgerError;
      const input = {lotId: sample.lotId, productName: sample.product.name, origin: sample.origin, harvestDate: sample.harvestDate, regionCode: 'TG-001', location: sample.origin, processorOrganizationId: companies[`${data.dataset}-SC`], distributorOrganizationId: companies[`${data.dataset}-PP`]};
      try {lot = await call('/lots', tokens[staff('FARMER', sample.staffIndex)], 'POST', input); report.created.lots++;}
      catch (createError) {if (createError.status && createError.status < 500) throw createError; lot = await recover(sample, admin);}
    }
  }
  checkLot(sample, lot);
  const pending = missingSteps(sample, lot);
  const validation = await call(`/lots/${sample.lotId}/validate`, admin);
  if (!validation.valid && validation.anomalies?.every(item => item.code?.startsWith('MYSQL_'))) lot = await recover(sample, admin);
  else assert.equal(validation.valid, true, `Invalid history ${sample.lotId}`);
  for (const type of pending) {lot = await writeLot(sample, lot, type, admin); report.created.events++;}
  await supportingRecords(sample, lot);
  if (!pending.length) report.skipped++;
  console.log(`${sample.lotId} ${lot.status} (${lot.events.length} committed events)`);
}
async function verify(admin) {
  await loadCompanies(admin, false);
  const current = await call('/users', admin);
  report.accounts = [];
  for (const sample of data.users) {
    const account = current.find(row => row.username === sample.username);
    assert.ok(account, `Missing ${sample.username}`); checkAccount(sample, account, companies[sample.organizationCode]);
    await login(sample.username);
    const visible = (await call('/lots', tokens[sample.username])).filter(row => row.lotId.startsWith(data.dataset));
    assert.ok(visible.length > 0, `No role data ${sample.username}`);
    if (sample.role === 'BUSINESS_ADMIN') {
      const staffUsers = await call('/users', tokens[sample.username]);
      assert.ok(staffUsers.length >= 2 && staffUsers.every(user => user.organizationId === account.organizationId));
    }
    report.accounts.push({username: sample.username, role: sample.role, visibleLots: visible.length, login: 'PASS'});
  }
  for (const sample of data.lots) {
    const lot = await call(`/lots/${sample.lotId}`, admin); checkLot(sample, lot);
    assert.equal(missingSteps(sample, lot).length, 0, `Incomplete dataset ${sample.lotId}`);
    const validation = await call(`/lots/${sample.lotId}/validate`, admin);
    assert.equal(validation.valid, true, `MySQL/Fabric mismatch ${sample.lotId}`);
    const history = await fabric.history(sample.lotId);
    assert.deepEqual(history, lot.events); assert.equal(new Set(history.map(event => event.eventId)).size, history.length);
    assert.ok(history.every(event => /^[a-f0-9]{64}$/.test(event.eventId)));
    const commits = [];
    for (const event of history) {
      const receipt = await fabric.commitStatus(event.eventId);
      assert.equal(receipt.successful, true, `Invalid commit ${event.eventId}`);
      commits.push(receipt);
    }
    const publicLot = await call(`/public/trace/${sample.lotId}`);
    assert.equal(publicLot.integrity.valid, true);
    report.lots.push({lotId: lot.lotId, productCode: sample.product.code, status: lot.status, events: history.length, transactionIds: history.map(event => event.eventId), commits, handoverRequests: history.filter(event => workflow.requests.includes(event.eventType)).length, handoverConfirmations: history.filter(event => workflow.confirmations.includes(event.eventType)).length, iesh: 'PASS', mysql: 'PASS', ledger: 'COMMITTED_VALID'});
  }
  report.checks.loginRbacReadOnlyReconciliation = 'PASS';
  report.productCount = data.products.length;
  report.eventCount = report.lots.reduce((sum, lot) => sum + lot.events, 0);
  report.validFabricTransactions = report.eventCount;
}
async function negativeTests(admin) {
  const sample = data.lots[3], farmer = tokens[staff('FARMER', sample.staffIndex)], processor = tokens[staff('PROCESSOR', sample.staffIndex)];
  const before = await fabric.history(sample.lotId);
  const cases = [
    ['anonymous', `/lots/${sample.lotId}`, null, 'GET', undefined, 401],
    ['wrong role', `/lots/${sample.lotId}/events`, farmer, 'POST', {eventType: 'CTE_PROCESS', location: 'QA', data: {}}, 403],
    ['no handover', `/lots/${sample.lotId}/handover/confirm`, processor, 'POST', {}, 409],
    ['skip stage', `/lots/${sample.lotId}/handover/request`, farmer, 'POST', {}, 409],
    ['stale event', `/lots/${sample.lotId}/events`, farmer, 'POST', {eventType: 'CTE_HARVEST', previousEventId: 'stale', location: 'QA', data: {quantity: 100, unit: 'kg'}}, 409],
    ['cross tenant', `/lots/${sample.lotId}`, tokens[staff('TRANSPORTER', 1)], 'GET', undefined, 403],
    ['invalid metadata', `/lots/${sample.lotId}/events`, farmer, 'POST', {eventType: 'CTE_HARVEST', previousEventId: before.at(-1).eventId, location: 'QA', data: {quantity: -1, unit: 'kg'}}, 400],
  ];
  report.rejections = [];
  for (const [name, endpoint, token, method, body, status] of cases) {
    await assert.rejects(call(endpoint, token, method, body), error => error.status === status);
    report.rejections.push({name, status, result: 'PASS'});
  }
  const storage = require('./storage');
  await storage.connect();
  try {
    await assert.rejects(fabric.submitEvent(sample.lotId, {eventType: 'CTE_RECEIVE_PROCESSOR', actorRole: 'PROCESSOR', previousEventId: before.at(-1).eventId, location: 'QA', data: {}}, accounts[staff('PROCESSOR', sample.staffIndex)]), error => error.details?.some(item => item.message.includes('FSM_INVALID')));
  } finally {await storage.close();}
  assert.deepEqual(await fabric.history(sample.lotId), before);
  report.checks.negativeApiAndRealChaincodeNoLedgerChange = 'PASS';
}
async function main() {
  const command = process.argv[2] || 'check';
  assert.ok(['check', 'seed', 'verify', 'test'].includes(command), 'Use check|seed|verify|test');
  if (command === 'seed') assertDemoEnvironment();
  const health = await call('/health/dependencies');
  assert.equal(health.mysql, true); assert.equal(health.fabric.ready, true); assert.equal(health.fabric.schemaVersion, 4);
  console.log(JSON.stringify({environment: process.env.NODE_ENV, database: process.env.MYSQL_DATABASE, ...health}));
  if (command === 'check') return;
  const admin = await login(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  if (command === 'seed') {
    await prepareAccounts(admin);
    for (const sample of data.lots) {
      try {await seedLot(sample, admin);}
      catch (error) {report.errors.push({lotId: sample.lotId, message: error.message}); console.error(`${sample.lotId}: ${error.message}`);}
    }
    assert.equal(report.errors.length, 0, 'Some lots require reconciliation; see report and rerun without resetting');
  }
  await verify(admin);
  if (command === 'test') await negativeTests(admin);
}
if (require.main === module) main().catch(error => {console.error(error.message); report.errors.push({message: error.message}); process.exitCode = 1;}).finally(async () => {
  const directory = process.env.DEMO_REPORT_DIR || path.join(__dirname, '../reports');
  fs.mkdirSync(directory, {recursive: true});
  fs.writeFileSync(path.join(directory, `demo-${process.argv[2] || 'check'}.json`), JSON.stringify(report, null, 2) + '\n');
  for (const token of new Set(Object.values(tokens))) {try {await call('/auth/logout', token, 'POST', {});} catch { /* Sessions may have expired during a long run. */ }}
  await fabric.close();
});
module.exports = {assertDemoEnvironment, missingSteps, checkAccount};
