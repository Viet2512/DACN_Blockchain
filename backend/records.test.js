const {test} = require('node:test');
const assert = require('node:assert/strict');
const {validateRecord} = require('./records');
const auth = require('./auth');
test('record validation rejects malformed time, metadata, missing KDE and impossible humidity', () => {
  const base = {occurredAt: '2026-11-06T00:00:00Z'};
  assert.throws(() => validateRecord('transport-logs', {...base, location: 'QA', humidity: 101}), /humidity/);
  assert.throws(() => validateRecord('cultivation-logs', {...base, activity: ''}), /activity/);
  assert.throws(() => validateRecord('quality-checks', {...base, result: 'fake'}), /result/);
  assert.throws(() => validateRecord('incidents', {occurredAt: 'invalid'}), /occurredAt/);
  assert.deepEqual(validateRecord('transport-logs', {...base, location: ' QA ', temperature: 0, humidity: 0}).data, {location: 'QA', temperature: 0, humidity: 0});
});
test('sessions expire after eight hours and cannot be revived', () => {
  const now = Date.now;
  const token = auth.createSession({username: 'ttl-test'});
  try {Date.now = () => now() + 8 * 60 * 60 * 1000 + 1; assert.equal(auth.getSession(token), null);}
  finally {Date.now = now;}
  assert.equal(auth.getSession(token), null);
});
