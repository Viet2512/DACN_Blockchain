const rules = {
  'cultivation-logs': {roles: ['FARMER'], required: ['activity']},
  'quality-checks': {roles: ['PROCESSOR'], required: ['result']},
  'transport-logs': {roles: ['TRANSPORTER'], required: ['location']},
  incidents: {roles: ['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'], required: ['type', 'description']},
};
function validateRecord(type, input) {
  const fail = message => { throw Object.assign(new Error(message), {statusCode: 400}); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Record must be a JSON object');
  const occurredAt = input.occurredAt;
  if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt))) fail('occurredAt must be a valid timestamp');
  const data = {};
  for (const key of ['activity', 'result', 'location', 'type', 'description', 'note']) {
    if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > 2000)) fail(`${key} must be text of at most 2000 characters`);
    if (typeof input[key] === 'string') data[key] = input[key].trim();
  }
  for (const key of rules[type].required) if (!data[key]) fail(`${key} is required`);
  if (type === 'quality-checks' && !['PASS', 'FAIL', 'PENDING'].includes(data.result)) fail('result must be PASS, FAIL or PENDING');
  for (const key of ['temperature', 'humidity']) if (input[key] != null && input[key] !== '') {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key])) fail(`${key} must be a finite number`);
    if (key === 'humidity' && (input[key] < 0 || input[key] > 100)) fail('humidity must be between 0 and 100');
    data[key] = input[key];
  }
  return {occurredAt: new Date(occurredAt).toISOString(), data};
}
module.exports = {rules, validateRecord};
