// The API and chaincode use the same rules so preflight and ledger validation cannot drift.
const { createHash } = require('node:crypto');
const rules = {
    CTE_CREATE: [null, 'CREATED', 'FARMER'],
    CTE_HARVEST: ['CREATED', 'HARVESTED', 'FARMER'],
    CTE_HANDOVER_PROCESSOR: ['HARVESTED', 'WAITING_PROCESSOR', 'FARMER'],
    CTE_RECEIVE_PROCESSOR: ['WAITING_PROCESSOR', 'RECEIVED_PROCESSOR', 'PROCESSOR'],
    CTE_PROCESS: ['RECEIVED_PROCESSOR', 'PROCESSED', 'PROCESSOR'],
    CTE_HANDOVER_SHIP: ['PROCESSED', 'WAITING_SHIP', 'PROCESSOR'],
    CTE_RECEIVE_SHIP: ['WAITING_SHIP', 'IN_TRANSIT', 'TRANSPORTER'],
    CTE_TRANSPORT: ['IN_TRANSIT', 'IN_TRANSIT', 'TRANSPORTER'],
    CTE_HANDOVER_RETAIL: ['IN_TRANSIT', 'WAITING_RETAIL', 'TRANSPORTER'],
    CTE_DISPATCH_RETAIL: ['WAITING_RETAIL', 'IN_RETAIL', 'DISTRIBUTOR'],
    CTE_DISPLAY_SALE: ['IN_RETAIL', 'READY_FOR_SALE', 'DISTRIBUTOR'],
    CTE_RECALL: ['*', 'RECALLED', '*'],
};
const requests = ['CTE_HANDOVER_PROCESSOR', 'CTE_HANDOVER_SHIP', 'CTE_HANDOVER_RETAIL'];
const confirmations = ['CTE_RECEIVE_PROCESSOR', 'CTE_RECEIVE_SHIP', 'CTE_DISPATCH_RETAIL'];
const msps = { FARMER: 'Org1MSP', PROCESSOR: 'Org1MSP', TRANSPORTER: 'Org2MSP', DISTRIBUTOR: 'Org3MSP' };
function fail(step, code, message) { throw Object.assign(new Error(JSON.stringify({ step, code, message })), { statusCode: step === 'Identity' ? 403 : step === 'Event' ? 400 : 409 }); }
function text(value, field, max = 255) {
    if (typeof value !== 'string' || !value.trim() || value.length > max)
        fail('Event', 'KDE_REQUIRED', `${field} must contain 1..${max} characters`);
    return value.trim();
}
function date(value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
        fail('Event', 'DATE_INVALID', 'date must be YYYY-MM-DD');
}
function canonical(value) {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function validateData(type, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        fail('Event', 'DATA_JSON', 'data must be an object');
    const allowed = type === 'CTE_CREATE' ? ['processorOrganizationId', 'distributorOrganizationId'] : ['note', 'documentHash', 'quantity', 'unit', 'date', 'qualityResult', 'temperature', 'humidity', ...(requests.includes(type) ? ['toOrg', 'toRegion', 'toOrganizationId'] : [])];
    if (Object.keys(data).some(key => !allowed.includes(key)))
        fail('Event', 'DATA_FIELD', 'Unsupported event data field');
    if (data.note !== undefined && (typeof data.note !== 'string' || data.note.length > 4000))
        fail('Event', 'NOTE', 'note must be text of at most 4000 characters');
    if (data.documentHash !== undefined && (typeof data.documentHash !== 'string' || !/^[a-f0-9]{64}$/.test(data.documentHash)))
        fail('Event', 'DOCUMENT_HASH', 'documentHash must be a SHA-256 hex digest');
    if (data.date !== undefined)
        date(data.date);
    if (['CTE_HARVEST', 'CTE_PROCESS', 'CTE_DISPATCH_RETAIL'].includes(type) || data.quantity !== undefined || data.unit !== undefined) {
        if (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity) || data.quantity <= 0 || !['kg', 'tấn', 'kiện'].includes(data.unit))
            fail('Event', 'QUANTITY', 'Positive quantity and supported unit are required');
    }
    if (['CTE_PROCESS', 'CTE_DISPLAY_SALE'].includes(type) && data.qualityResult !== 'PASS')
        fail('Event', 'QUALITY', 'A passing quality inspection is required');
    if (data.qualityResult !== undefined && !['PASS', 'FAIL', 'PENDING'].includes(data.qualityResult))
        fail('Event', 'QUALITY', 'Unknown quality result');
    if (type === 'CTE_RECALL')
        text(data.note, 'recall reason', 4000);
    for (const key of ['temperature', 'humidity'])
        if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]) || (key === 'humidity' && (data[key] < 0 || data[key] > 100))))
            fail('Event', 'SENSOR', `Invalid ${key}`);
}
function lotId(value) {
    const id=text(value,'lotId',120);
    // MySQL folds case/accents; canonical ASCII IDs prevent distinct ledger keys colliding in SQL.
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) fail('Event','LOT_ID','Lot IDs use ASCII letters, digits, hyphen and underscore');
    return id.toUpperCase();
}
function create(input) {
    const lot = { schemaVersion: 4, docType: 'lot', lotId: lotId(input.lotId), productName: text(input.productName, 'productName'), origin: text(input.origin, 'origin'), harvestDate: input.harvestDate, owner: text(input.actorId, 'actorId', 120), ownerOrganizationId: text(input.organizationId, 'organizationId', 80), processorOrganizationId: text(input.processorOrganizationId, 'processorOrganizationId', 80), distributorOrganizationId: text(input.distributorOrganizationId, 'distributorOrganizationId', 80), regionCode: text(input.actorRegion, 'region', 80), status: null, currentHolder: input.actorId, currentHolderOrganizationId: input.organizationId, pendingTo: '', pendingToRegion: '', pendingToOrganizationId: '', pendingFromOrganizationId: '', lastEventId: '', lastEventTimestamp: '', createdAt: '', eventCount: 0, participantOrganizationIds: [input.organizationId, input.processorOrganizationId, input.distributorOrganizationId] };
    date(lot.harvestDate);
    if (lot.regionCode === 'GLOBAL')
        fail('Identity', 'REGION_REQUIRED', 'A specific region is required');
    return lot;
}
function validate(lot, event) {
    const type = event.eventType, rule = rules[type];
    if (!rule)
        fail('Event', 'EVENT_TYPE', 'Unknown event type');
    if (!msps[event.actorRole] || event.actorOrg !== msps[event.actorRole] || (rule[2] !== '*' && rule[2] !== event.actorRole) || !event.userId || event.actorId !== event.userId || !event.businessOrganizationId || !event.signerId)
        fail('Identity', 'RBAC_DENIED', 'Certificate identity, role or MSP is invalid');
    text(event.actorRegion, 'actorRegion', 80);
    text(event.businessOrganizationId, 'businessOrganizationId', 80);
    text(event.userId, 'userId', 120);
    if (event.actorRegion === 'GLOBAL')
        fail('Identity', 'REGION_REQUIRED', 'A specific region is required');
    if (lot.status === 'RECALLED' || (rule[0] !== '*' && rule[0] !== lot.status))
        fail('State', 'FSM_INVALID', `${type} is not allowed from ${lot.status}`);
    if ((event.previousEventId || '') !== (lot.lastEventId || ''))
        fail('Handover/History', 'PREVIOUS_EVENT', 'previousEventId does not match ledger head');
    if (typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp)) || (lot.lastEventTimestamp && Date.parse(event.timestamp) < Date.parse(lot.lastEventTimestamp)))
        fail('Event', 'TIMESTAMP', 'Event timestamp precedes the ledger head or is invalid');
    text(event.location, 'location');
    validateData(type, event.data);
    const org = event.businessOrganizationId;
    if (type === 'CTE_RECALL') {
        if (!lot.participantOrganizationIds.includes(org))
            fail('Identity', 'BUSINESS_ORGANIZATION_DENIED', 'Organization has no relationship with this lot');
        return;
    }
    if (confirmations.includes(type)) {
        if (org !== lot.pendingToOrganizationId || event.actorOrg !== lot.pendingTo || event.actorRegion !== lot.pendingToRegion || !lot.pendingFromOrganizationId || lot.currentHolderOrganizationId !== lot.pendingFromOrganizationId)
            fail('Handover/History', 'WRONG_RECEIVER', 'No matching handover to this business organization, MSP and region');
    }
    else if (org !== lot.currentHolderOrganizationId || event.actorRegion !== lot.regionCode)
        fail('Identity', 'HOLDER_REQUIRED', 'Only the current custodian in this region can perform this operation');
    if (requests.includes(type)) {
        const target = type === 'CTE_HANDOVER_PROCESSOR' ? [lot.processorOrganizationId, 'Org1MSP'] : type === 'CTE_HANDOVER_RETAIL' ? [lot.distributorOrganizationId, 'Org3MSP'] : [event.data.toOrganizationId, 'Org2MSP'];
        text(event.data.toOrganizationId, 'toOrganizationId', 80);
        text(event.data.toRegion, 'toRegion', 80);
        if (event.data.toRegion === 'GLOBAL' || event.data.toOrganizationId !== target[0] || event.data.toOrg !== target[1] || event.data.toOrganizationId === org)
            fail('Handover/History', 'DESTINATION', 'Handover destination does not match the assigned participant');
    }
}
function apply(lot, event) {
    const type = event.eventType;
    if (requests.includes(type)) {
        lot.pendingFromOrganizationId = event.businessOrganizationId;
        lot.pendingToOrganizationId = event.data.toOrganizationId;
        lot.pendingTo = event.data.toOrg;
        lot.pendingToRegion = event.data.toRegion;
        lot.participantOrganizationIds = [...new Set([...lot.participantOrganizationIds, event.data.toOrganizationId])];
    }
    if (confirmations.includes(type)) {
        lot.currentHolder = event.userId;
        lot.currentHolderOrganizationId = event.businessOrganizationId;
        lot.regionCode = event.actorRegion;
        lot.pendingFromOrganizationId = '';
        lot.pendingToOrganizationId = '';
        lot.pendingTo = '';
        lot.pendingToRegion = '';
    }
    lot.status = rules[type][1];
    lot.lastEventId = event.eventId;
    lot.lastEventTimestamp = event.timestamp;
    lot.eventCount++;
    if (!lot.createdAt)
        lot.createdAt = event.timestamp;
}
function baseline(events) {
    let previous = "";
    for (const event of events) {
        if (event.previousEventId !== previous || event.integrityHash !== hash({ ...event, integrityHash: "" }))
            return { valid: false };
        previous = event.eventId;
    }
    return { valid: events.length > 0 };
}
function verify(lot, events) {
    const anomalies = [];
    const initial = events[0];
    if (!initial)
        return { valid: false, checkedEvents: 0, scope: 'IESH_V4', anomalies: [{ step: 'Event', code: 'EMPTY', message: 'No history' }] };
    const replay = { ...lot, status: null, currentHolder: initial.actorId, currentHolderOrganizationId: lot.ownerOrganizationId, regionCode: initial.actorRegion, pendingTo: '', pendingToRegion: '', pendingToOrganizationId: '', pendingFromOrganizationId: '', lastEventId: '', lastEventTimestamp: '', createdAt: '', eventCount: 0, participantOrganizationIds: [lot.ownerOrganizationId, lot.processorOrganizationId, lot.distributorOrganizationId] };
    if (lot.owner !== initial.actorId || lot.ownerOrganizationId !== initial.businessOrganizationId || lot.processorOrganizationId !== initial.data?.processorOrganizationId || lot.distributorOrganizationId !== initial.data?.distributorOrganizationId)
        anomalies.push({ step: 'Identity', code: 'LOT_IDENTITY', message: 'Assigned participants differ from creation evidence' });
    const seen = new Set();
    for (const event of events) {
        if (!event || typeof event !== 'object') {
            anomalies.push({ step: 'Event', code: 'MALFORMED', message: 'Event must be an object' });
            continue;
        }
        try {
            if (seen.has(event.eventId) || event.lotId !== lot.lotId || event.schemaVersion !== 4)
                fail('Handover/History', 'EVENT_ID', 'Duplicate or foreign event');
            seen.add(event.eventId);
            validate(replay, event);
            if (event.dataHash !== (event.data.documentHash || hash(event.data)) || event.integrityHash !== hash({ ...event, integrityHash: '' }))
                fail('Data Integrity', 'HASH', 'Event content differs from its hash');
            const receiving = confirmations.includes(event.eventType), sending = requests.includes(event.eventType);
            if (event.fromOrganizationId !== (receiving ? replay.pendingFromOrganizationId : replay.currentHolderOrganizationId) || event.toOrganizationId !== (sending ? event.data.toOrganizationId : receiving ? event.businessOrganizationId : '') || event.requestedBy !== (sending ? event.userId : '') || event.confirmedBy !== (receiving ? event.userId : '') || event.handoverConfirmed !== receiving)
                fail('Handover/History', 'HANDOVER_METADATA', 'Handover evidence differs from the replayed state');
        }
        catch (error) {
            let detail;
            try {
                detail = JSON.parse(error.message);
            }
            catch {
                detail = { step: 'Event', code: 'MALFORMED', message: 'Malformed event' };
            }
            anomalies.push({ ...detail, eventId: event.eventId });
        }
        if (rules[event.eventType]) {
            try {
                apply(replay, event);
            }
            catch {
                anomalies.push({ step: 'Event', code: 'MALFORMED', message: 'Cannot replay malformed event', eventId: event.eventId });
            }
        }
    }
    for (const key of ['status', 'lastEventId', 'lastEventTimestamp', 'eventCount', 'currentHolder', 'currentHolderOrganizationId', 'regionCode', 'pendingFromOrganizationId', 'pendingToOrganizationId', 'pendingTo', 'pendingToRegion', 'createdAt', 'participantOrganizationIds'])
        if (JSON.stringify(replay[key]) !== JSON.stringify(lot[key]))
            anomalies.push({ step: 'Handover/History', code: 'LOT_STATE', message: `Lot ${key} differs from history` });
    return { valid: !anomalies.length, checkedEvents: events.length, scope: 'IESH_V4', businessIdentityVerified: true, anomalies };
}
module.exports = { lotId, baseline, canonical, rules, requests, confirmations, msps, create, validate, validateData, apply, verify, hash, fail };
