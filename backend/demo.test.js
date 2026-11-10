const {test} = require('node:test');
const assert = require('node:assert/strict');
const {assertDemoEnvironment, missingSteps, checkAccount} = require('./demo');
const data = require('./demo-data');
const workflow = require('../chaincode/src/workflow');

test('demo refuses production, implicit writes, local ledger mode and remote targets', () => {
  const env = {NODE_ENV: 'development', DEMO_DATA_ENABLED: 'true', MYSQL_ENABLED: 'true', FABRIC_ENABLED: 'true', MYSQL_DATABASE: 'demo', ADMIN_USERNAME: 'fixture', ADMIN_PASSWORD: 'fixture-only', DEMO_PASSWORD: 'fixture-only-12', API_URL: 'http://backend:8080/api'};
  assert.doesNotThrow(() => assertDemoEnvironment(env));
  for (const override of [{NODE_ENV: 'production'}, {DEMO_DATA_ENABLED: 'false'}, {FABRIC_ENABLED: 'false'}, {MYSQL_ENABLED: 'false'}, {DEMO_PASSWORD: 'short'}, {API_URL: 'https://example.com/api'}]) assert.throws(() => assertDemoEnvironment({...env, ...override}));
});
test('demo fixture has 13 unique users, 4 companies mapped to 3 MSPs, 10 products and 24 valid FSM histories', () => {
  assert.equal(data.users.length, 13); assert.equal(new Set(data.users.map(user => user.username)).size, 13);
  assert.equal(data.organizations.length, 4); assert.equal(new Set(data.organizations.map(org => org.mspId)).size, 3);
  assert.equal(data.products.length, 10); assert.equal(data.lots.length, 24);
  assert.equal(data.lots.filter(lot => lot.target === 10).length, 3);
  for (const org of data.organizations) assert.equal(data.users.filter(user => user.organizationCode === org.code).length, 3);
  for (const sample of data.lots) {
    let status = null;
    for (const type of data.expectedTypes(sample)) {
      const [from, next] = workflow.rules[type];
      assert.ok(from === '*' || from === status); status = next;
    }
  }
});
test('resume fills a prefix, skips completed/advanced histories and rejects divergent histories without changing them', () => {
  const sample = data.lots[0];
  const lot = {events: data.sequence.slice(0, 4).map(eventType => ({eventType}))};
  assert.deepEqual(missingSteps(sample, lot), data.sequence.slice(4));
  assert.deepEqual(missingSteps(data.lots[3], lot), []);
  assert.deepEqual(missingSteps(sample, {events: data.sequence.map(eventType => ({eventType}))}), []);
  const bad = {events: [{eventType: 'CTE_CREATE'}, {eventType: 'CTE_PROCESS'}]};
  const before = structuredClone(bad); assert.throws(() => missingSteps(sample, bad)); assert.deepEqual(bad, before);
});
test('pre-existing non-demo or disabled accounts are never silently reused', () => {
  const expected = data.users[0];
  const account = {...expected, status: 'ACTIVE', organizationId: null};
  assert.doesNotThrow(() => checkAccount(expected, account));
  for (const override of [{role: 'FARMER'}, {organizationId: 'foreign'}, {status: 'INACTIVE'}, {email: 'real@example.com'}]) assert.throws(() => checkAccount(expected, {...account, ...override}));
});
