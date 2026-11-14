// Live dev rehearsal: only the named fixture is created; existing business data is preserved.
require('dotenv').config({quiet: true});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const mysql = require('mysql2/promise');
const fabric = require('./fabric');
const {assertDemoEnvironment} = require('./demo');
const API = process.env.API_URL || 'http://127.0.0.1:3001/api';
const lotId = 'TC-REHEARSAL-20261117-001';
const directory = process.env.DEMO_REPORT_DIR || path.join(__dirname, '../reports');
const file = path.join(directory, 'rehearsal-20261117.json');
const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {lotId, checks: {}, rejections: []};
const sessions = {};
let db;
async function call(endpoint, actor, method = 'GET', body) {
  const response = await fetch(API + endpoint, {method, signal: AbortSignal.timeout(90000), headers: {'Content-Type': 'application/json', ...(actor ? {Authorization: `Bearer ${sessions[actor].token}`} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  return {status: response.status, body: response.status === 204 ? null : await response.json()};
}
function expect(result, status) {
  assert.equal(result.status, status, `HTTP ${result.status}: ${result.body?.message || result.body?.error || 'Unexpected response'}`);
  return result.body;
}
async function login(username) {
  sessions[username] = expect(await call('/auth/login', null, 'POST', {username, password: process.env.DEMO_PASSWORD}), 200);
  return sessions[username].user;
}
async function deny(name, endpoint, actor, method, body, status, code) {
  const result = await call(endpoint, actor, method, body);
  expect(result, status);
  if (code) assert.equal(result.body.code, code);
  report.rejections = report.rejections.filter(item => item.name !== name);
  report.rejections.push({name, source: 'LIVE_API', status, code: result.body.code, reason: result.body.message || result.body.error});
}
async function account(actor, username, role, organizationId) {
  const existing = expect(await call('/users', actor), 200).find(user => user.username === username);
  if (existing) {
    assert.equal(existing.organizationId, organizationId);
    assert.equal(existing.role, role);
    assert.equal(existing.email, `${username}@tracechain.invalid`);
    assert.equal(existing.status, 'ACTIVE', 'Existing fixture account must not be silently reactivated');
  } else {
    const invitation = expect(await call('/users/invitations', actor, 'POST', {username, role, organizationId, fullName: `Diễn tập ${username}`, email: `${username}@tracechain.invalid`, regionCode: 'TG-001'}), 201);
    expect(await call('/auth/accept-invitation', null, 'POST', {token: invitation.activationToken, password: process.env.DEMO_PASSWORD}), 204);
  }
  return login(username);
}
async function identity(username, admin) {
  let user = sessions[username].user;
  if (user.fabricIdentityStatus !== 'ACTIVE') {
    assert.equal(user.fabricIdentityStatus, 'PENDING', 'Do not reactivate a disabled signer');
    const requests = expect(await call('/fabric-identity-requests', admin), 200);
    const request = requests.find(item => item.username === username);
    assert.notEqual(request?.status, 'DISABLED');
    if (!request) expect(await call(`/users/${username}/fabric-identity/request`, admin, 'POST', {}), 204);
    if (!request || ['PENDING', 'FAILED'].includes(request.status)) expect(await call(`/users/${username}/fabric-identity/issue`, admin, 'POST', {}), 202);
    for (let attempt = 0; attempt < 45; attempt++) {
      user = expect(await call('/users', admin), 200).find(item => item.username === username);
      if (user.fabricIdentityStatus === 'ACTIVE') break;
      const pending = expect(await call('/fabric-identity-requests', admin), 200).find(item => item.username === username);
      assert.notEqual(pending?.status, 'FAILED', 'CA operator failed; inspect it instead of bypassing identity checks');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(user.fabricIdentityStatus, 'ACTIVE', 'CA operator issuance timed out');
    await login(username);
  }
}
async function snapshot() {
  const result = {};
  for (const table of ['user_accounts', 'lots', 'trace_events', 'event_documents', 'lot_business_scopes', 'fabric_projections', 'lot_records']) {
    const [rows] = await db.query(`SELECT * FROM ${table}`);
    result[table] = rows.filter(row => row.lot_id !== lotId && !String(row.username || '').startsWith('tc_rehearsal_')).map(row => {
      if (table === 'user_accounts') { delete row.last_login_at; delete row.updated_at; }
      return JSON.stringify(row);
    }).sort();
  }
  return result;
}
async function prepare() {
  const system = 'tc_system';
  await login(system);
  const companies = expect(await call('/business-organizations', system), 200);
  report.accounts = {};
  for (const key of ['a', 'b']) {
    const code = `TC-REHEARSAL-20261117-${key.toUpperCase()}`;
    const company = companies.find(item => item.code === code) || expect(await call('/business-organizations', system, 'POST', {code, name: `Nông hộ diễn tập ${key.toUpperCase()}`, type: 'FARM', mspId: 'Org1MSP'}), 201);
    assert.equal(company.type, 'FARM'); assert.equal(company.mspId, 'Org1MSP'); assert.equal(company.status, 'ACTIVE');
    const admin = `tc_rehearsal_admin_${key}`, staff = `tc_rehearsal_farm_${key}`;
    await account(system, admin, 'BUSINESS_ADMIN', company.organizationId);
    await account(admin, staff, 'FARMER', company.organizationId);
    await identity(staff, admin);
    const user = sessions[staff].user;
    report.accounts[staff] = {username: staff, userId: user.userId, organizationId: user.organizationId, role: user.role, mspId: user.orgMsp, identity: user.fabricIdentityStatus};
  }
  const admin = 'tc_rehearsal_admin_a', staff = 'tc_rehearsal_farm_a', other = 'tc_rehearsal_farm_b';
  await account(admin, 'tc_rehearsal_missing', 'FARMER', sessions[staff].user.organizationId);
  await deny('staff cannot invite administrators', '/users/invitations', staff, 'POST', {username: 'never-created', role: 'BUSINESS_ADMIN'}, 403);
  await deny('administrator cannot invite outside their business', '/users/invitations', admin, 'POST', {username: 'never-created', role: 'FARMER', organizationId: sessions[other].user.organizationId}, 403);
  await deny('administrator cannot issue another business certificate', `/users/${other}/fabric-identity/issue`, admin, 'POST', {}, 404);
  const organizations = expect(await call('/business-organizations', system), 200);
  report.input = {lotId, productName: 'Xoài diễn tập bảo vệ TraceChain', origin: 'Vùng trồng Cái Bè, Tiền Giang', harvestDate: '2026-11-14', location: 'Nông hộ diễn tập A', regionCode: 'TG-001', processorOrganizationId: organizations.find(item => item.code === 'TC-DEMO-V1-SC').organizationId, distributorOrganizationId: organizations.find(item => item.code === 'TC-DEMO-V1-PP').organizationId};
  // Test a separate ID so the missing-certificate check is not masked by an existing lot conflict on rerun.
  const missing = {...report.input, lotId: `${lotId}-NO-CERT`};
  await deny('missing certificate cannot create', '/lots', 'tc_rehearsal_missing', 'POST', missing, 403, 'FABRIC_IDENTITY_REQUIRED');
  expect(await call(`/public/trace/${missing.lotId}`), 404);
  report.checks.liveModelB = 'PASS';
  report.checks.realCaOperatorIssuance = 'PASS';
  report.checks.twoBusinessesShareOrg1MSP = 'PASS';
}
async function verify() {
  const system = 'tc_system';
  await login(system); await login('tc_rehearsal_farm_a'); await login('tc_rehearsal_farm_b');
  const lot = expect(await call(`/lots/${lotId}`, system), 200);
  assert.equal(lot.status, 'READY_FOR_SALE'); assert.equal(lot.events.length, 11);
  const ledger = await fabric.readLot(lotId), history = await fabric.history(lotId);
  assert.deepEqual(history, lot.events); assert.equal(ledger.lastEventId, lot.lastEventId); assert.equal(ledger.status, lot.status);
  const [events] = await db.execute('SELECT event_id FROM trace_events WHERE lot_id=?', [lotId]);
  assert.deepEqual(events.map(row => row.event_id).sort(), history.map(event => event.eventId).sort());
  const [[projection]] = await db.execute('SELECT projection_json FROM fabric_projections WHERE lot_id=?', [lotId]);
  assert.equal(projection.projection_json.lastEventId, lot.lastEventId); assert.equal(projection.projection_json.status, lot.status);
  report.commits = [];
  for (const event of history) {
    const receipt = await fabric.commitStatus(event.eventId);
    assert.equal(receipt.validationCode, 0); assert.equal(receipt.successful, true);
    report.commits.push({eventType: event.eventType, txId: event.eventId, validationCode: receipt.validationCode, commit: 'COMMITTED_VALID'});
  }
  await deny('same MSP is not the same business', `/lots/${lotId}`, 'tc_rehearsal_farm_b', 'GET', undefined, 403);
  const verification = expect(await call(`/lots/${lotId}/validate`, system), 200);
  assert.equal(verification.valid, true); assert.equal(verification.scope, 'IESH_V4');
  const trace = expect(await call(`/public/trace/${lotId}`), 200);
  assert.equal(trace.integrity.valid, true); assert.equal(trace.events.length, 11);
  assert.deepEqual(await fabric.history(lotId), history);
  report.finalStatus = lot.status;
  report.qrUrl = `${process.env.PUBLIC_BASE_URL}/trace/${lotId}`;
  report.mysql = {eventRows: events.length, projectionHead: projection.projection_json.lastEventId, projectionStatus: projection.projection_json.status};
  report.historySha256 = createHash('sha256').update(JSON.stringify(history)).digest('hex');
  report.checks.fabricApiMysqlSameLot = 'PASS';
  report.checks.all11CommitsValid = 'PASS';
  report.checks.publicTrace = 'PASS';
}
async function main() {
  const command = process.argv[2];
  assert.ok(['prepare', 'verify'].includes(command), 'Use prepare|verify');
  assertDemoEnvironment({...process.env, API_URL: API});
  const health = expect(await call('/health/dependencies'), 200);
  assert.equal(health.mysql, true); assert.equal(health.fabric.ready, true); assert.equal(health.fabric.schemaVersion, 4);
  report.dependencies = health;
  report.qrUrl = `${process.env.PUBLIC_BASE_URL}/trace/${lotId}`;
  report.baseCommit = process.env.TESTED_COMMIT || report.baseCommit;
  report.checkedAt = new Date().toISOString();
  db = await mysql.createConnection({host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, timezone: 'Z'});
  const before = await snapshot();
  for (const [table, rows] of Object.entries(before)) {
    const previous = report.preservation?.[table];
    if (previous) {
      assert.equal(rows.length, previous.originalRows, `Existing ${table} row count changed between phases`);
      assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), previous.sha256, `Existing ${table} content changed between phases`);
    }
  }
  const counts = async () => (await db.query('SELECT (SELECT COUNT(*) FROM business_organizations) AS businesses,(SELECT COUNT(*) FROM user_accounts) AS accounts,(SELECT COUNT(*) FROM lots) AS lots,(SELECT COUNT(*) FROM trace_events) AS events,(SELECT COUNT(*) FROM fabric_identities) AS identities'))[0][0];
  const beforeCounts = await counts(), repeated = command === 'prepare' && report.checks.liveModelB === 'PASS';
  try {
    await (command === 'prepare' ? prepare() : verify());
    const afterCounts = await counts();
    if (repeated || command === 'verify') assert.deepEqual(afterCounts, beforeCounts, 'Rerun changed fixture counts');
    report.runs ||= []; report.runs.push({phase: command, checkedAt: new Date().toISOString(), before: beforeCounts, after: afterCounts});
    if (repeated) report.checks.repeatPrepareNoDuplicates = 'PASS';
    const after = await snapshot();
    for (const table of Object.keys(before)) {
      const current = new Set(after[table]);
      assert.ok(before[table].every(row => current.has(row)), `Existing ${table} rows changed`);
    }
    report.preservation = Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, {originalRows: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), unchanged: true}]));
    report.checks.existingBusinessDataPreserved = 'PASS';
    delete report.error;
    console.log(JSON.stringify({phase: command, lotId, checks: report.checks}));
  } finally {
    for (const actor of Object.keys(sessions)) { try { await call('/auth/logout', actor, 'POST', {}); } catch { /* Best effort on shutdown. */ } }
  }
}
main().catch(error => {report.error = error.message; console.error(error.message); process.exitCode = 1;}).finally(async () => {
  if (db) await db.end(); await fabric.close();
  fs.mkdirSync(directory, {recursive: true}); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
});
