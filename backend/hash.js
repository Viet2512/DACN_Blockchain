const {createHash} = require('node:crypto');

function sortedValue(value) {
  if (Array.isArray(value)) return value.map(sortedValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedValue(value[key])]));
  }
  return value;
}

function eventHash(event) {
  return createHash('sha256').update(JSON.stringify(sortedValue({
    docType: 'traceEvent',
    eventId: event.eventId,
    lotId: event.lotId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    location: event.location,
    actorId: event.actorId,
    actorRole: event.actorRole,
    previousEventId: event.previousEventId,
    data: event.data || {},
    dataHash: event.dataHash || '',
    integrityHash: '',
  }))).digest('hex');
}

module.exports = {eventHash};
