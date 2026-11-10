const { randomUUID } = require('node:crypto');
const workflow = require('../chaincode/src/workflow');
const lots = new Map();
const transitions = Object.fromEntries(Object.entries(workflow.rules).map(([type, [from, to, role]]) => [type, { from, to, roles: role === '*' ? Object.keys(workflow.msps) : [role] }]));
function append(lot, input) {
    if (lot.schemaVersion !== 4)
        workflow.fail('Identity', 'LEGACY_READ_ONLY', 'Historical lots are read-only');
    const userId = input.userId || input.actorId;
    const receiving = workflow.confirmations.includes(input.eventType), sending = workflow.requests.includes(input.eventType);
    const event = { schemaVersion: 4, docType: 'traceEvent', eventId: randomUUID(), lotId: lot.lotId, eventType: input.eventType, timestamp: input.timestamp || new Date().toISOString(), location: input.location, actorId: userId, userId, businessOrganizationId: input.organizationId, actorOrg: input.orgMsp || workflow.msps[input.actorRole], actorRole: input.actorRole, actorRegion: input.actorRegion || input.regionCode || lot.regionCode, signerId: `LOCAL:${userId}`, previousEventId: input.previousEventId || '', data: input.data || {}, integrityHash: '', fromOrganizationId: receiving ? lot.pendingFromOrganizationId : lot.currentHolderOrganizationId, toOrganizationId: sending ? input.data?.toOrganizationId : receiving ? input.organizationId : '', requestedBy: sending ? userId : '', confirmedBy: receiving ? userId : '', handoverConfirmed: receiving };
    event.dataHash = event.data.documentHash || workflow.hash(event.data);
    workflow.validate(lot, event);
    event.integrityHash = workflow.hash(event);
    workflow.apply(lot, event);
    lot.events.push(event);
}
function createLot(input, persist = true) {
    const lot = { ...workflow.create({ ...input, actorRegion: input.regionCode || input.actorRegion }), events: [] };
    if (lots.has(lot.lotId)) workflow.fail('State', 'LOT_EXISTS', 'Lot already exists');
    append(lot, { ...input, eventType: 'CTE_CREATE', previousEventId: '', data: { processorOrganizationId: input.processorOrganizationId, distributorOrganizationId: input.distributorOrganizationId } });
    if (persist) lots.set(lot.lotId, lot);
    return lot;
}

function recordEvent(id, input, snapshot) { const lot = structuredClone(snapshot || getLot(id)); append(lot, input); if (!snapshot)
    lots.set(id, lot); return lot; }
function getLot(id) { const lot = lots.get(id); if (!lot)
    throw Object.assign(new Error('Lot not found'), { statusCode: 404 }); return lot; }
function listLots() { return [...lots.values()].map(({ events, ...lot }) => ({ ...lot, eventCount: events.length })); }
function restoreLot(lot) { lots.set(lot.lotId, structuredClone(lot)); }
function reset() { lots.clear(); }
module.exports = { createLot, recordEvent, getLot, listLots, restoreLot, reset, transitions };
