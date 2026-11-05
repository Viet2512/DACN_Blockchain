const test = require('node:test');
const assert = require('node:assert/strict');
const {TraceabilityContract} = require('../dist/traceability');

function context(role, msp = 'Org1MSP') {
  const state = new Map();
  let tx = 0;
  let currentRole = role;
  return {
    clientIdentity: {
      getMSPID: () => msp,
      getID: () => `x509::${currentRole}`,
      getAttributeValue: (name) => name === 'role' ? currentRole : undefined,
    },
    stub: {
      getState: async (key) => state.get(key) || Buffer.alloc(0),
      putState: async (key, value) => state.set(key, value),
      getTxID: () => `tx-${++tx}`,
      getTxTimestamp: () => ({seconds: 1730000000, nanos: 0}),
      createCompositeKey: (type, parts) => `${type}:${parts.join(':')}`,
      setEvent: () => {},
      getStateByPartialCompositeKey: async function* (type, parts) {
        for (const [key, value] of state) if (key.startsWith(`${type}:${parts.join(':')}:`)) yield {value};
      },
    },
    setRole: (nextRole) => { currentRole = nextRole; },
  };
}

test('admin is rejected at IESH Identity step', async () => {
  const contract = new TraceabilityContract();
  await assert.rejects(
    contract.CreateLot(context('ADMIN'), 'LOT-ADMIN', 'Xoai', 'Tien Giang', '2026-01-01', 'GPS'),
    error => JSON.parse(error.message).step === 'Identity',
  );
});

test('farmer can create a lot and wrong state is rejected', async () => {
  const contract = new TraceabilityContract();
  const ctx = context('FARMER');
  const lot = JSON.parse(await contract.CreateLot(ctx, 'LOT-1', 'Xoai', 'Tien Giang', '2026-01-01', 'GPS'));
  assert.equal(lot.status, 'CREATED');
  ctx.setRole('PROCESSOR');
  await assert.rejects(
    contract.AddTraceEvent(ctx, 'LOT-1', 'CTE_PROCESS', 'GPS', 'hash', '{}', lot.lastEventId),
    error => JSON.parse(error.message).step === 'State',
  );
});
