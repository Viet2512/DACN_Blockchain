const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./domain');

test.beforeEach(() => domain.reset());

const baseLot = {
  lotId: 'LOT-001',
  productName: 'Xoài Cát Hòa Lộc',
  origin: 'Tiền Giang',
  harvestDate: '2026-10-28',
  actorId: 'farmer-01',
  actorRole: 'FARMER',
  location: '10.36,106.36',
};

test('enforces the traceability FSM and records a hash-linked history', () => {
  const created = domain.createLot(baseLot);
  const harvested = domain.recordEvent('LOT-001', { eventType: 'CTE_HARVEST', actorId: 'farmer-01', actorRole: 'FARMER', location: '10.36,106.36', previousEventId: created.lastEventId });
  domain.recordEvent('LOT-001', { eventType: 'CTE_PROCESS', actorId: 'processor-01', actorRole: 'PROCESSOR', location: '10.4,106.4', previousEventId: harvested.lastEventId });
  const lot = domain.getLot('LOT-001');
  assert.equal(lot.status, 'PROCESSED');
  assert.equal(lot.events.length, 3);
  assert.equal(lot.events[1].previousEventId, lot.events[0].eventId);
  assert.match(lot.events[1].dataHash, /^[a-f0-9]{64}$/);
});

test('rejects an event from the wrong role or wrong state', () => {
  const created = domain.createLot(baseLot);
  assert.throws(
    () => domain.recordEvent('LOT-001', { eventType: 'CTE_PROCESS', actorId: 'farmer-01', actorRole: 'FARMER', location: 'x', previousEventId: created.lastEventId }),
    /cannot submit/,
  );
  assert.throws(
    () => domain.recordEvent('LOT-001', { eventType: 'CTE_DISPLAY_SALE', actorId: 'store-01', actorRole: 'DISTRIBUTOR', location: 'x', previousEventId: created.lastEventId }),
    /not allowed/,
  );
});

test('rejects malformed lot dates before recording the creation event', () => {
  assert.throws(
    () => domain.createLot({...baseLot, harvestDate: '28-10-2026'}),
    /harvestDate must be a valid date in YYYY-MM-DD format/,
  );
  assert.throws(
    () => domain.createLot({...baseLot, harvestDate: '2026-02-30'}),
    /harvestDate must be a valid date in YYYY-MM-DD format/,
  );
});
