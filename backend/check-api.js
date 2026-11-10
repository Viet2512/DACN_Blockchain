const path = require('node:path');
require('dotenv').config({path: path.join(__dirname, '..', '.env'), quiet: true});
const assert = require('node:assert/strict');
const base = process.env.API_URL || 'http://localhost:8080/api';
async function main() {
  const result = {base, checked: [], warnings: []};
  let token;
  async function get(endpoint, json = true) {
    const response = await fetch(base + endpoint, {headers: token ? {Authorization: `Bearer ${token}`} : {}});
    assert.equal(response.status, 200, `${endpoint}: HTTP ${response.status}`);
    result.checked.push(`GET ${endpoint}`);
    return json ? response.json() : response;
  }
  result.health = await get('/health');
  assert.ok(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD, 'Set existing ADMIN_USERNAME and ADMIN_PASSWORD; no password is reset by this check');
  const login = await fetch(base + '/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD})});
  assert.equal(login.status, 200, 'Configured existing admin credentials did not authenticate');
  token = (await login.json()).token;
  try {
    assert.equal((await get('/auth/me')).role, 'ADMIN');
    const users = await get('/users'); const actors = await get('/actors'); const organizations = await get('/organizations');
    const lots = await get('/lots'); const audit = await get('/admin/audit-log');
    result.counts = {users: users.length, actors: actors.length, organizations: organizations.length, lots: lots.length, audit: audit.length};
    for (const row of lots) {
      const endpoint = `/lots/${encodeURIComponent(row.lotId)}`;
      const lot = await get(endpoint); const history = await get(endpoint + '/history');
      assert.equal(history.length, lot.events.length); assert.equal(lot.lastEventId, history.at(-1)?.eventId);
      const verification = await get(endpoint + '/validate');
      if (!verification.valid) result.warnings.push({lotId: lot.lotId, issue: 'HISTORY_REQUIRES_REVIEW', invalidHashes: verification.invalidHashes?.length, brokenLinks: verification.brokenLinks?.length});
      const documents = await get(endpoint + '/verify-documents');
      result.documentChecks = (result.documentChecks || 0) + documents.documents.length;
      result.documentMismatches = (result.documentMismatches || 0) + documents.documents.filter(document => !document.valid).length;
      const publicLot = await get(`/public/trace/${encodeURIComponent(lot.lotId)}`);
      assert.equal(publicLot.lotId, lot.lotId);
      assert.ok(publicLot.events.every(event => !('data' in event) && !('actorId' in event)));
      const qr = await get(endpoint + '/qr', false); assert.equal(qr.headers.get('content-type'), 'image/png');
    }
  } finally {
    const response = await fetch(base + '/auth/logout', {method: 'POST', headers: {Authorization: `Bearer ${token}`}});
    assert.equal(response.status, 204);
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
