const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./domain');

test.beforeEach(() => domain.reset());

const baseLot = {organizationId:'farm-A',processorOrganizationId:'processor-A',distributorOrganizationId:'distributor-A',regionCode:'TG-001',
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
  const harvested = domain.recordEvent('LOT-001', { eventType: 'CTE_HARVEST', actorId: 'farmer-01', actorRole: 'FARMER', organizationId:'farm-A',data:{quantity:10,unit:'kg'},location: '10.36,106.36', previousEventId: created.lastEventId });
  const pending=domain.recordEvent('LOT-001',{eventType:'CTE_HANDOVER_PROCESSOR',actorId:'farmer-01',organizationId:'farm-A',actorRole:'FARMER',location:'TG',data:{toOrganizationId:'processor-A',toOrg:'Org1MSP',toRegion:'TG-001'},previousEventId:harvested.lastEventId});
  const received=domain.recordEvent('LOT-001',{eventType:'CTE_RECEIVE_PROCESSOR',actorId:'processor-01',organizationId:'processor-A',actorRole:'PROCESSOR',location:'TG',data:{},previousEventId:pending.lastEventId});
  domain.recordEvent('LOT-001',{eventType:'CTE_PROCESS',actorId:'processor-01',organizationId:'processor-A',actorRole:'PROCESSOR',location:'TG',data:{quantity:9,unit:'kg',qualityResult:'PASS'},previousEventId:received.lastEventId});
  const lot = domain.getLot('LOT-001');
  assert.equal(lot.status, 'PROCESSED');
  assert.equal(lot.events.length, 5);
  assert.equal(lot.events[1].previousEventId, lot.events[0].eventId);
  assert.match(lot.events[1].dataHash, /^[a-f0-9]{64}$/);
});

test('rejects an event from the wrong role or wrong state', () => {
  const created = domain.createLot(baseLot);
  assert.throws(
    () => domain.recordEvent('LOT-001', { eventType: 'CTE_PROCESS', actorId: 'farmer-01', actorRole: 'FARMER', location: 'x', previousEventId: created.lastEventId }),
    /RBAC_DENIED/,
  );
  assert.throws(
    () => domain.recordEvent('LOT-001', { eventType: 'CTE_DISPLAY_SALE', actorId: 'store-01',organizationId:'distributor-A', actorRole: 'DISTRIBUTOR', location: 'x', previousEventId: created.lastEventId }),
    /FSM_INVALID/,
  );
});

test('rejects malformed lot dates before recording the creation event', () => {
  assert.throws(
    () => domain.createLot({...baseLot, harvestDate: '28-10-2026'}),
    /DATE_INVALID/,
  );
  assert.throws(
    () => domain.createLot({...baseLot, harvestDate: '2026-02-30'}),
    /DATE_INVALID/,
  );
});

// A persisted snapshot is authoritative after commit or recovery.
test('restoring a saved lot replaces stale process state', () => {
  const lot = domain.createLot(baseLot);
  const snapshot = structuredClone(lot);
  domain.recordEvent(lot.lotId, {eventType: 'CTE_HARVEST', actorId: baseLot.actorId, actorRole: 'FARMER', organizationId:'farm-A',data:{quantity:10,unit:'kg'},location: 'TG', previousEventId: lot.lastEventId});
  domain.restoreLot(snapshot);
  assert.equal(domain.getLot(lot.lotId).status, 'CREATED');
  domain.reset();
  domain.restoreLot(snapshot);
  assert.equal(domain.getLot(lot.lotId).status, 'CREATED');
});

test('draft event leaves persisted process state unchanged until explicitly restored', () => {
  const lot = domain.createLot(baseLot);
  const draft = domain.recordEvent(lot.lotId, {eventType: 'CTE_HARVEST', actorId: baseLot.actorId, actorRole: 'FARMER', organizationId:'farm-A',data:{quantity:10,unit:'kg'},location: 'TG', previousEventId: lot.lastEventId}, lot);
  assert.equal(draft.status, 'HARVESTED');
  assert.equal(domain.getLot(lot.lotId).status, 'CREATED');
  assert.throws(() => domain.recordEvent(lot.lotId, {eventType: 'CTE_HARVEST', actorId: baseLot.actorId, actorRole: 'FARMER', organizationId:'farm-A',data:{quantity:10,unit:'kg'},location: 'TG', timestamp: 'invalid', previousEventId: lot.lastEventId}, lot), /TIMESTAMP/);
});
