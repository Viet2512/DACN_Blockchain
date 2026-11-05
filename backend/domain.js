const { createHash, randomUUID } = require('node:crypto');
const { eventHash } = require('./hash');

const transitions = {
  CTE_CREATE: { from: null, to: 'CREATED', roles: ['FARMER'] },
  CTE_HARVEST: { from: 'CREATED', to: 'HARVESTED', roles: ['FARMER'] },
  CTE_PROCESS: { from: 'HARVESTED', to: 'PROCESSED', roles: ['PROCESSOR'] },
  CTE_HANDOVER_SHIP: { from: 'PROCESSED', to: 'WAITING_SHIP', roles: ['PROCESSOR'] },
  CTE_RECEIVE_SHIP: { from: 'WAITING_SHIP', to: 'IN_TRANSIT', roles: ['TRANSPORTER'] },
  CTE_DISPATCH_RETAIL: { from: 'IN_TRANSIT', to: 'IN_RETAIL', roles: ['DISTRIBUTOR'] },
  CTE_DISPLAY_SALE: { from: 'IN_RETAIL', to: 'READY_FOR_SALE', roles: ['DISTRIBUTOR'] },
  CTE_RECALL: { from: '*', to: 'RECALLED', roles: ['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'] },
};

const lots = new Map();

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${field} is required`);
  }
  return value.trim();
}

function requireDate(value, field) {
  const date = requireText(value, field);
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    fail(`${field} must be a valid date in YYYY-MM-DD format`);
  }
  return date;
}

function createLot(input) {
  const lotId = requireText(input.lotId, 'lotId');
  if (lots.has(lotId)) fail(`Lot ${lotId} already exists`, 409);

  const lot = {
    lotId,
    productName: requireText(input.productName, 'productName'),
    origin: requireText(input.origin, 'origin'),
    harvestDate: requireDate(input.harvestDate, 'harvestDate'),
    regionCode: requireText(input.regionCode || input.data?.regionCode || 'GLOBAL', 'regionCode'),
    status: null,
    currentHolder: requireText(input.actorId, 'actorId'),
    createdAt: new Date().toISOString(),
    lastEventId: null,
    pendingTo: '',
    pendingToRegion: '',
    events: [],
  };

  appendEvent(lot, {
    eventType: 'CTE_CREATE',
    actorId: input.actorId,
    actorRole: input.actorRole,
    actorRegion: input.regionCode,
    timestamp: input.timestamp,
    location: input.location,
    data: { productName: lot.productName, origin: lot.origin, harvestDate: lot.harvestDate },
  });
  lots.set(lotId, lot);
  return lot;
}

function appendEvent(lot, input) {
  const eventType = requireText(input.eventType, 'eventType');
  const rule = transitions[eventType];
  if (!rule) fail(`Unsupported event type: ${eventType}`);
  const actorId = requireText(input.actorId, 'actorId');
  const actorRole = requireText(input.actorRole, 'actorRole').toUpperCase();
  const timestamp = input.timestamp || new Date().toISOString();
  const location = requireText(input.location, 'location');
  const actorRegion = requireText(input.actorRegion || input.regionCode || lot.regionCode || 'GLOBAL', 'actorRegion');

  if (!rule.roles.includes(actorRole)) fail(`${actorRole} cannot submit ${eventType}`, 403);
  if (rule.from !== '*' && rule.from !== lot.status) {
    fail(`${eventType} is not allowed when lot status is ${lot.status}`, 409);
  }
  if (eventType !== 'CTE_CREATE' && input.previousEventId !== lot.lastEventId) {
    fail('previousEventId does not match the latest event', 409);
  }
  if (eventType !== 'CTE_CREATE' && lot.lastEventId === null) {
    fail('The lot must have a creation event first', 409);
  }
  if (lot.status === 'RECALLED' && eventType !== 'CTE_RECALL') {
    fail('A recalled lot is locked', 409);
  }
  if (eventType === 'CTE_HANDOVER_SHIP' && (!input.data?.toOrg || typeof input.data.toOrg !== 'string')) {
    fail('Handover destination organization is required');
  }
  if (eventType !== 'CTE_RECEIVE_SHIP' && actorRegion !== lot.regionCode) fail(`Actor region ${actorRegion} cannot access lot region ${lot.regionCode}`, 403);
  if (eventType === 'CTE_HANDOVER_SHIP' && (!input.data?.toRegion || typeof input.data.toRegion !== 'string')) {
    fail('Handover destination region is required');
  }
  if (eventType === 'CTE_RECEIVE_SHIP' && actorRegion !== lot.pendingToRegion) {
    fail(`Receiver region ${actorRegion} does not match pending region ${lot.pendingToRegion}`, 403);
  }
  if (eventType === 'CTE_RECEIVE_SHIP' && lot.pendingTo && lot.pendingTo !== input.orgMsp) {
    fail('Receiver organization does not match pendingTo', 403);
  }

  const event = {
    eventId: randomUUID(),
    lotId: lot.lotId,
    eventType,
    timestamp,
    location,
    actorId,
    actorRole,
    actorRegion,
    previousEventId: lot.lastEventId,
    data: input.data || {},
  };
  event.dataHash = input.data?.documentHash || createHash('sha256').update(JSON.stringify(input.data || {})).digest('hex');
  event.integrityHash = eventHash(event);
  lot.events.push(event);
  lot.lastEventId = event.eventId;
  lot.status = rule.to;
  lot.currentHolder = actorId;
  if (eventType === 'CTE_HANDOVER_SHIP') lot.pendingTo = input.data.toOrg;
  if (eventType === 'CTE_HANDOVER_SHIP') lot.pendingToRegion = input.data.toRegion;
  if (eventType === 'CTE_RECEIVE_SHIP') {
    lot.pendingTo = '';
    lot.pendingToRegion = '';
    lot.regionCode = actorRegion;
  }
  return event;
}

function recordEvent(lotId, input) {
  const lot = lots.get(lotId);
  if (!lot) fail(`Lot ${lotId} was not found`, 404);
  appendEvent(lot, input);
  return lot;
}

function listLots() {
  return [...lots.values()].map(({ events, ...lot }) => ({ ...lot, eventCount: events.length }));
}

function getLot(lotId) {
  const lot = lots.get(lotId);
  if (!lot) fail(`Lot ${lotId} was not found`, 404);
  return lot;
}

function reset() {
  lots.clear();
}

module.exports = { createLot, recordEvent, listLots, getLot, reset, transitions };
