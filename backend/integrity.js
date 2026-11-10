const { eventHash } = require("./hash");

function verifyHistory(events) {
  const brokenLinks = [];
  const invalidHashes = [];
  events.forEach((event, index) => {
    const expectedPrevious = index === 0 ? "" : events[index - 1].eventId;
    if ((event.previousEventId || "") !== expectedPrevious)
      brokenLinks.push(event.eventId);
    if (
      event.integrityHash
        ? event.integrityHash !== eventHash(event)
        : event.dataHash !== eventHash({ ...event, dataHash: "" })
    ) {
      invalidHashes.push(event.eventId);
    }
  });
  return {
    valid: events.length > 0 && !brokenLinks.length && !invalidHashes.length,
    checkedEvents: events.length,
    brokenLinks,
    invalidHashes,
    scope: "HASH_AND_PREVIOUS_EVENT",
  };
}

function publicProjection(lot, isFabric) {
  return {
    lotId: lot.lotId,
    productName: lot.productName,
    origin: lot.origin,
    harvestDate: lot.harvestDate,
    status: lot.status,
    source: isFabric ? "FABRIC" : "LOCAL",
    events: lot.events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      location: event.location,
      actorRole: event.actorRole,
      actorOrg: event.actorOrg,
      previousEventId: event.previousEventId,
      dataHash: event.dataHash,
    })),
    integrity: isFabric
      ? { valid: null, scope: "NOT_VERIFIED", checkedEvents: 0 }
      : verifyHistory(lot.events),
    notice:
      isFabric ? "IESH kiểm tra dữ liệu đã ghi và quy trình; không chứng minh nguồn gốc vật lý." : "Dữ liệu LOCAL: kiểm tra hash và liên kết, không phải bằng chứng Fabric hoặc IESH đầy đủ.",
  };
}

function orderHistory(events, lastEventId) {
  const byId = new Map(events.map(event => [event.eventId, event]));
  const ordered = [];
  const visited = new Set();
  let id = lastEventId;
  while (id && byId.has(id) && !visited.has(id)) {
    visited.add(id);
    const event = byId.get(id);
    ordered.push(event);
    id = event.previousEventId;
  }
  // Keep disconnected evidence visible to verification instead of discarding it.
  return [...ordered.reverse(), ...events.filter(event => !visited.has(event.eventId))];
}
module.exports = { verifyHistory, publicProjection, orderHistory };
