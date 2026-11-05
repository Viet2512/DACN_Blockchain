import {Context, Contract, Info, Returns, Transaction} from 'fabric-contract-api';
import {createHash} from 'node:crypto';
import stringify from 'json-stringify-deterministic';
import sortKeysRecursive from 'sort-keys-recursive';

type Role = 'FARMER' | 'PROCESSOR' | 'TRANSPORTER' | 'DISTRIBUTOR';
type EventType = 'CTE_CREATE' | 'CTE_HARVEST' | 'CTE_PROCESS' | 'CTE_HANDOVER_SHIP' |
  'CTE_RECEIVE_SHIP' | 'CTE_DISPATCH_RETAIL' | 'CTE_DISPLAY_SALE' | 'CTE_RECALL';
type ValidationStep = 'Identity' | 'Event' | 'State' | 'Handover/History';

interface Lot {
  docType: 'lot';
  lotId: string;
  productName: string;
  origin: string;
  harvestDate: string;
  owner: string;
  currentHolder: string;
  status: string;
  createdAt: string;
  lastEventId: string;
  pendingTo: string;
  regionCode: string;
  pendingToRegion: string;
  eventCount: number;
}

interface TraceEvent {
  docType: 'traceEvent';
  eventId: string;
  lotId: string;
  eventType: EventType;
  timestamp: string;
  actorId: string;
  actorOrg: string;
  actorRegion: string;
  actorRole: Role;
  location: string;
  previousEventId: string;
  dataHash: string;
  integrityHash: string;
  data: Record<string, unknown>;
  handoverConfirmed: boolean;
  toOrg: string;
}

const transitions: Record<EventType, {from: string | null | '*'; to: string; roles: Role[]}> = {
  CTE_CREATE: {from: null, to: 'CREATED', roles: ['FARMER']},
  CTE_HARVEST: {from: 'CREATED', to: 'HARVESTED', roles: ['FARMER']},
  CTE_PROCESS: {from: 'HARVESTED', to: 'PROCESSED', roles: ['PROCESSOR']},
  CTE_HANDOVER_SHIP: {from: 'PROCESSED', to: 'WAITING_SHIP', roles: ['PROCESSOR']},
  CTE_RECEIVE_SHIP: {from: 'WAITING_SHIP', to: 'IN_TRANSIT', roles: ['TRANSPORTER']},
  CTE_DISPATCH_RETAIL: {from: 'IN_TRANSIT', to: 'IN_RETAIL', roles: ['DISTRIBUTOR']},
  CTE_DISPLAY_SALE: {from: 'IN_RETAIL', to: 'READY_FOR_SALE', roles: ['DISTRIBUTOR']},
  CTE_RECALL: {from: '*', to: 'RECALLED', roles: ['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR']},
};

@Info({title: 'Traceability', description: 'CTE/KDE traceability with deterministic IESH validation'})
export class TraceabilityContract extends Contract {
  @Transaction()
  public async CreateLot(ctx: Context, lotId: string, productName: string, origin: string, harvestDate: string, location: string, regionCode: string, dataJson: string = '{}'): Promise<string> {
    this.requireText(lotId, 'lotId');
    this.requireText(productName, 'productName');
    this.requireText(origin, 'origin');
    this.requireDate(harvestDate, 'harvestDate');
    this.requireText(location, 'location');
    const actor = this.identity(ctx, 'CTE_CREATE');
    if (actor.region !== regionCode) throw this.error('Identity', 'REGION_DENIED', 'Certificate region does not match lot region');
    const exists = await ctx.stub.getState(this.lotKey(lotId));
    if (exists.length > 0) throw this.error('State', 'LOT_EXISTS', `Lot ${lotId} already exists`);
    const lot: Lot = {
      docType: 'lot', lotId, productName, origin, harvestDate, owner: actor.id,
      currentHolder: actor.id, status: '', createdAt: '', lastEventId: '', pendingTo: '', regionCode, pendingToRegion: '', eventCount: 0,
    };
    const data = this.parseData(dataJson);
    await this.validateEvent(ctx, 'CTE_CREATE', location, data);
    await this.appendEvent(ctx, lot, 'CTE_CREATE', location, actor.id, actor.org, actor.region, actor.role, data, '');
    return JSON.stringify(lot);
  }

  @Transaction()
  public async AddTraceEvent(ctx: Context, lotId: string, eventType: string, location: string, dataHash: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    this.requireText(lotId, 'lotID');
    const bytes = await ctx.stub.getState(this.lotKey(lotId));
    if (bytes.length === 0) throw this.error('State', 'LOT_NOT_FOUND', `Lot ${lotId} does not exist`);
    const lot = JSON.parse(bytes.toString()) as Lot;
    const type = eventType as EventType;
    if (!transitions[type]) throw this.error('Event', 'EVENT_TYPE', `Unsupported event type ${eventType}`);
    const actor = this.identity(ctx, eventType);
    if (eventType !== 'CTE_RECEIVE_SHIP' && actor.region !== lot.regionCode) throw this.error('Identity', 'REGION_DENIED', 'Certificate region does not match lot region');
    const data = this.parseData(dataJson);
    if (await this.ieshEnabled(ctx)) {
      await this.validateEvent(ctx, type, location, data);
      this.validateState(lot, type);
      this.validateHistory(lot, previousEventId);
      this.validateHandover(lot, type, actor.org, actor.region, data);
    }
    this.requireText(dataHash, 'dataHash');
    await this.appendEvent(ctx, lot, type, location, actor.id, actor.org, actor.region, actor.role, {...data, dataHash}, previousEventId);
    return JSON.stringify(lot);
  }

  @Transaction()
  public async RecordEvent(ctx: Context, lotId: string, eventType: string, location: string, actorRole: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    const data = this.parseData(dataJson);
    const dataHash = typeof data.dataHash === 'string' ? data.dataHash : 'not-provided';
    const actor = this.identity(ctx, eventType);
    if (actor.role !== actorRole.toUpperCase()) throw this.error('Identity', 'ROLE_MISMATCH', 'Certificate role does not match actorRole');
    return this.AddTraceEvent(ctx, lotId, eventType, location, dataHash, JSON.stringify(data), previousEventId);
  }

  @Transaction()
  public async RequestHandover(ctx: Context, lotId: string, toOrg: string, toRegion: string, location: string, dataHash: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    const data = {...this.parseData(dataJson), toOrg, toRegion};
    return this.AddTraceEvent(ctx, lotId, 'CTE_HANDOVER_SHIP', location, dataHash, JSON.stringify(data), previousEventId);
  }

  @Transaction()
  public async ConfirmHandover(ctx: Context, lotId: string, location: string, dataHash: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    const data = this.parseData(dataJson);
    return this.AddTraceEvent(ctx, lotId, 'CTE_RECEIVE_SHIP', location, dataHash, JSON.stringify(data), previousEventId);
  }

  @Transaction()
  public async RecallLot(ctx: Context, lotId: string, location: string, dataHash: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    return this.AddTraceEvent(ctx, lotId, 'CTE_RECALL', location, dataHash, dataJson, previousEventId);
  }

  @Transaction()
  public async SetValidationMode(ctx: Context, enabled: string): Promise<string> {
    this.assertAdmin(ctx);
    const value = enabled === 'true';
    await ctx.stub.putState('config:iesh', Buffer.from(value ? 'true' : 'false'));
    return JSON.stringify({ieshEnabled: value});
  }

  @Transaction(false)
  @Returns('string')
  public async QueryLot(ctx: Context, lotId: string): Promise<string> {
    const bytes = await ctx.stub.getState(this.lotKey(lotId));
    if (bytes.length === 0) throw this.error('State', 'LOT_NOT_FOUND', `Lot ${lotId} does not exist`);
    return bytes.toString();
  }

  @Transaction(false)
  @Returns('string')
  public async GetHistory(ctx: Context, lotId: string): Promise<string> {
    const iterator = await ctx.stub.getStateByPartialCompositeKey('event', [lotId]);
    const events: TraceEvent[] = [];
    for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
      events.push(JSON.parse(result.value.value.toString()) as TraceEvent);
    }
    await iterator.close();
    return JSON.stringify(events);
  }

  @Transaction(false)
  @Returns('string')
  public async ValidateTraceHistory(ctx: Context, lotId: string): Promise<string> {
    const lot = JSON.parse(await this.QueryLot(ctx, lotId)) as Lot;
    const history = JSON.parse(await this.GetHistory(ctx, lotId)) as TraceEvent[];
    const anomalies: Array<{step: ValidationStep; code: string; eventId?: string; message: string}> = [];
    let status = '';
    let previous = '';
    for (const event of history) {
      if (event.previousEventId !== previous) anomalies.push({step: 'Handover/History', code: 'PREVIOUS_EVENT', eventId: event.eventId, message: 'previousEventID does not form a single chain'});
      const rule = transitions[event.eventType];
      if (!rule || (rule.from !== '*' && rule.from !== status)) anomalies.push({step: 'State', code: 'FSM', eventId: event.eventId, message: `Invalid transition from ${status}`});
      if (event.eventType === 'CTE_HANDOVER_SHIP' && !event.toOrg) anomalies.push({step: 'Handover/History', code: 'TO_ORG', eventId: event.eventId, message: 'Handover has no destination organization'});
      status = rule?.to || status;
      previous = event.eventId;
    }
    if (lot.lastEventId !== previous) anomalies.push({step: 'Handover/History', code: 'LAST_EVENT', message: 'Lot lastEventID differs from history'});
    return JSON.stringify({valid: anomalies.length === 0, lotId, status: lot.status, checkedEvents: history.length, anomalies});
  }

  @Transaction(false)
  @Returns('string')
  public async VerifyDocumentHash(ctx: Context, lotId: string, eventId: string, documentHash: string): Promise<string> {
    const events = JSON.parse(await this.GetHistory(ctx, lotId)) as TraceEvent[];
    const event = events.find(item => item.eventId === eventId);
    return JSON.stringify({valid: !!event && event.dataHash === documentHash, eventId, documentHash});
  }

  private async appendEvent(ctx: Context, lot: Lot, eventType: EventType, location: string, actorId: string, actorOrg: string, actorRegion: string, actorRole: Role, data: Record<string, unknown>, previousEventId: string): Promise<void> {
    const eventId = ctx.stub.getTxID();
    const txTimestamp = ctx.stub.getTxTimestamp();
    const timestamp = new Date(Number(txTimestamp.seconds) * 1000 + Math.floor(txTimestamp.nanos / 1e6)).toISOString();
    const toOrg = typeof data.toOrg === 'string' ? data.toOrg : '';
    const documentHash = String(data.documentHash || data.dataHash || this.hashDocument(data));
    const event: TraceEvent = {docType: 'traceEvent', eventId, lotId: lot.lotId, eventType, timestamp, actorId, actorOrg, actorRegion, actorRole, location, previousEventId, dataHash: documentHash, integrityHash: '', data, handoverConfirmed: eventType === 'CTE_RECEIVE_SHIP', toOrg};
    event.integrityHash = this.hashEvent(event);
    await ctx.stub.putState(ctx.stub.createCompositeKey('event', [lot.lotId, eventId]), this.bytes(event));
    lot.status = transitions[eventType].to;
    lot.currentHolder = eventType === 'CTE_RECEIVE_SHIP' ? actorId : lot.currentHolder;
    lot.pendingTo = eventType === 'CTE_HANDOVER_SHIP' ? toOrg : eventType === 'CTE_RECEIVE_SHIP' ? '' : lot.pendingTo;
    lot.pendingToRegion = eventType === 'CTE_HANDOVER_SHIP' ? String(data.toRegion || '') : eventType === 'CTE_RECEIVE_SHIP' ? '' : lot.pendingToRegion;
    if (eventType === 'CTE_RECEIVE_SHIP') lot.regionCode = actorRegion;
    lot.lastEventId = eventId;
    lot.eventCount += 1;
    if (!lot.createdAt) lot.createdAt = timestamp;
    await ctx.stub.putState(this.lotKey(lot.lotId), this.bytes(lot));
    ctx.stub.setEvent('TraceEventRecorded', Buffer.from(JSON.stringify(event)));
  }

  private identity(ctx: Context, eventType: string): {id: string; org: string; role: Role; region: string} {
    const org = ctx.clientIdentity.getMSPID();
    const id = ctx.clientIdentity.getID();
    const certRole = (ctx.clientIdentity.getAttributeValue('role') || '').toUpperCase();
    const region = ctx.clientIdentity.getAttributeValue('region') || 'GLOBAL';
    if (certRole === 'ADMIN' || !certRole) throw this.error('Identity', 'ADMIN_OR_MISSING_ROLE', `Certificate cannot submit ${eventType}`);
    if (!['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'].includes(certRole)) throw this.error('Identity', 'ROLE_UNKNOWN', 'Certificate role is not a supply-chain role');
    const role = certRole as Role;
    const allowed = (org === 'Org1MSP' && (role === 'FARMER' || role === 'PROCESSOR')) ||
      (org === 'Org2MSP' && role === 'TRANSPORTER') || (org === 'Org3MSP' && role === 'DISTRIBUTOR');
    if (!allowed || !transitions[eventType as EventType]?.roles.includes(role)) throw this.error('Identity', 'RBAC_DENIED', `${org}/${role} cannot submit ${eventType}`);
    return {id, org, role, region};
  }

  private assertAdmin(ctx: Context): void {
    if (ctx.clientIdentity.getAttributeValue('role')?.toUpperCase() !== 'ADMIN') throw this.error('Identity', 'ADMIN_REQUIRED', 'Admin certificate is required');
  }

  private async validateEvent(ctx: Context, eventType: EventType, location: string, data: Record<string, unknown>): Promise<void> {
    if (await this.ieshEnabled(ctx) && (!eventType || !location || !data)) throw this.error('Event', 'KDE_REQUIRED', 'eventType, location and data are required');
  }

  private validateState(lot: Lot, eventType: EventType): void {
    if (lot.status === 'RECALLED' && eventType !== 'CTE_RECALL') throw this.error('State', 'RECALLED_LOCK', 'Recalled lot is locked');
    const rule = transitions[eventType];
    if (rule.from !== '*' && rule.from !== lot.status) throw this.error('State', 'FSM_INVALID', `${eventType} is not allowed from ${lot.status}`);
  }

  private validateHistory(lot: Lot, previousEventId: string): void {
    if (previousEventId !== lot.lastEventId) throw this.error('Handover/History', 'PREVIOUS_EVENT', 'previousEventID does not match lastEventID');
  }

  private validateHandover(lot: Lot, eventType: EventType, actorOrg: string, actorRegion: string, data: Record<string, unknown>): void {
    if (eventType === 'CTE_HANDOVER_SHIP' && (!data.toOrg || typeof data.toOrg !== 'string')) throw this.error('Handover/History', 'TO_ORG_REQUIRED', 'Handover destination organization is required');
    if (eventType === 'CTE_RECEIVE_SHIP' && lot.pendingTo !== actorOrg) throw this.error('Handover/History', 'WRONG_RECEIVER', 'Receiver organization does not match pendingTo');
    if (eventType === 'CTE_HANDOVER_SHIP' && (!data.toRegion || typeof data.toRegion !== 'string')) throw this.error('Handover/History', 'TO_REGION_REQUIRED', 'Handover destination region is required');
    if (eventType === 'CTE_RECEIVE_SHIP' && lot.pendingToRegion !== actorRegion) throw this.error('Handover/History', 'WRONG_RECEIVER_REGION', 'Receiver region does not match pendingToRegion');
  }

  private parseData(dataJson: string): Record<string, unknown> {
    try { return JSON.parse(dataJson || '{}') as Record<string, unknown>; } catch { throw this.error('Event', 'DATA_JSON', 'dataJson must be valid JSON'); }
  }

  private async ieshEnabled(ctx: Context): Promise<boolean> {
    const bytes = await ctx.stub.getState('config:iesh');
    return bytes.length === 0 || bytes.toString() !== 'false';
  }
  private hashDocument(data: Record<string, unknown>): string { return createHash('sha256').update(stringify(sortKeysRecursive(data))).digest('hex'); }
  private hashEvent(event: TraceEvent): string {
    return createHash('sha256').update(stringify(sortKeysRecursive({...event, integrityHash: ''}))).digest('hex');
  }
  private requireText(value: string, field: string): string { if (typeof value !== 'string' || value.trim() === '') throw this.error('Event', 'KDE_REQUIRED', `${field} is required`); return value.trim(); }
  private requireDate(value: string, field: string): string { const date = this.requireText(value, field); const parsed = new Date(`${date}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw this.error('Event', 'DATE_INVALID', `${field} must be YYYY-MM-DD`); return date; }
  private error(step: ValidationStep, code: string, message: string): Error { return new Error(JSON.stringify({step, code, message})); }
  private lotKey(lotId: string): string { return `lot:${lotId}`; }
  private bytes(value: unknown): Buffer { return Buffer.from(stringify(sortKeysRecursive(value as Record<string, unknown>))); }
}
