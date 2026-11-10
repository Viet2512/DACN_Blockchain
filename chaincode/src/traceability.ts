import {Context, Contract, Info, Returns, Transaction} from 'fabric-contract-api';
import {createHash} from 'node:crypto';
import * as workflow from './workflow';
import stringify from 'json-stringify-deterministic';
import sortKeysRecursive from 'sort-keys-recursive';

type Role = 'FARMER' | 'PROCESSOR' | 'TRANSPORTER' | 'DISTRIBUTOR';
type EventType = 'CTE_HANDOVER_PROCESSOR' | 'CTE_RECEIVE_PROCESSOR' | 'CTE_HANDOVER_RETAIL' | 'CTE_TRANSPORT' | 'CTE_CREATE' | 'CTE_HARVEST' | 'CTE_PROCESS' | 'CTE_HANDOVER_SHIP' |
  'CTE_RECEIVE_SHIP' | 'CTE_DISPATCH_RETAIL' | 'CTE_DISPLAY_SALE' | 'CTE_RECALL';
type ValidationStep = 'Identity' | 'Event' | 'State' | 'Handover/History' | 'Data Integrity';

interface Lot {
  schemaVersion?: number;
  ownerOrganizationId?: string;
  processorOrganizationId?: string;
  distributorOrganizationId?: string;
  currentHolderOrganizationId?: string;
  pendingToOrganizationId?: string;
  pendingFromOrganizationId?: string;
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
  userId?: string;
  businessOrganizationId?: string;
  signerId?: string;
  fromOrganizationId?: string;
  toOrganizationId?: string;
  requestedBy?: string;
  confirmedBy?: string;
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
  CTE_HANDOVER_PROCESSOR: {from:'HARVESTED',to:'WAITING_PROCESSOR',roles:['FARMER']},
  CTE_RECEIVE_PROCESSOR: {from:'WAITING_PROCESSOR',to:'RECEIVED_PROCESSOR',roles:['PROCESSOR']},
  CTE_HANDOVER_RETAIL: {from:'IN_TRANSIT',to:'WAITING_RETAIL',roles:['TRANSPORTER']},
  CTE_TRANSPORT: {from:'IN_TRANSIT',to:'IN_TRANSIT',roles:['TRANSPORTER']},
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
    const actor = this.identity(ctx, 'CTE_CREATE');
    if (actor.region !== regionCode) throw this.error('Identity','REGION_DENIED','Certificate region differs from lot region');
    const data = this.parseData(dataJson);
    const lot = workflow.create({lotId,productName,origin,harvestDate,actorId:actor.id,organizationId:actor.businessOrg,actorRegion:actor.region,...data});
    if ((await ctx.stub.getState(this.lotKey(lot.lotId))).length) throw this.error('State','LOT_EXISTS','Lot already exists');
    await this.appendV4(ctx,lot,'CTE_CREATE',location,data,'');
    return JSON.stringify(lot);
  }

  @Transaction()
  public async AddTraceEvent(ctx: Context, lotId: string, eventType: string, location: string, dataHash: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    const lot = JSON.parse(await this.QueryLot(ctx,lotId));
    if (lot.schemaVersion !== 4) throw this.error('Identity','LEGACY_READ_ONLY','Historical lots are read-only; create a v4 lot without rewriting history');
    const data = this.parseData(dataJson);
    const expectedHash = typeof data.documentHash === 'string' ? data.documentHash : workflow.hash(data);
    if (dataHash !== expectedHash) throw this.error('Event','DATA_HASH','Supplied hash differs from event data');
    await this.appendV4(ctx,lot,eventType,location,data,previousEventId);
    return JSON.stringify(lot);
  }

  @Transaction()
  public async RecordEvent(ctx: Context, lotId: string, eventType: string, location: string, actorRole: string, dataJson: string = '{}', previousEventId: string = ''): Promise<string> {
    const data = this.parseData(dataJson);
    const dataHash = typeof data.documentHash === 'string' ? data.documentHash : workflow.hash(data);
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
    if (enabled !== 'true') throw this.error('State', 'VALIDATION_REQUIRED', 'Safety validation cannot be disabled');
    const value = true;
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
    const lot = JSON.parse(await this.QueryLot(ctx, lotId)) as Lot;
    const byId = new Map(events.map(event => [event.eventId, event]));
    const ordered: TraceEvent[] = [];
    const seen = new Set<string>();
    let id = lot.lastEventId;
    while (id && byId.has(id) && !seen.has(id)) {
      seen.add(id);
      const event = byId.get(id)!;
      ordered.push(event);
      id = event.previousEventId;
    }
    return JSON.stringify([...ordered.reverse(), ...events.filter(event => !seen.has(event.eventId))]);
  }

  @Transaction(false)
  @Returns('string')
  public async ValidateTraceHistory(ctx: Context, lotId: string): Promise<string> {
    const lot = JSON.parse(await this.QueryLot(ctx, lotId)) as Lot;
    if (lot.schemaVersion === 4) return JSON.stringify(workflow.verify(lot,JSON.parse(await this.GetHistory(ctx,lotId))));
    const history = JSON.parse(await this.GetHistory(ctx, lotId)) as TraceEvent[];
    const anomalies: Array<{step: ValidationStep; code: string; eventId?: string; message: string}> = [];
    let status: string | null = null;
    let previous = '';
    let region = history[0]?.actorRegion || '';
    let pendingOrg = '';
    let pendingRegion = '';
    let time = -Infinity;
    let pendingBusiness = '';
    let pendingFromBusiness = '';
    let holderBusiness = lot.ownerOrganizationId || '';
    let holderUser = history[0]?.actorId || '';
    for (const event of history) {
      const anomaly = (step: ValidationStep, code: string, message: string) => anomalies.push({step, code, eventId: event.eventId, message});
      if ((event.previousEventId || '') !== previous) anomaly('Handover/History', 'PREVIOUS_EVENT', 'previousEventID does not form a single chain');
      const rule = transitions[event.eventType];
      if (!rule || (rule.from !== '*' && rule.from !== status) || status === 'RECALLED') anomaly('State', 'FSM', `Invalid transition from ${status}`);
      const expectedOrg = {FARMER: 'Org1MSP', PROCESSOR: 'Org1MSP', TRANSPORTER: 'Org2MSP', DISTRIBUTOR: 'Org3MSP'};
      if (!event.actorId || expectedOrg[event.actorRole] !== event.actorOrg || !rule?.roles.includes(event.actorRole) || !event.actorRegion || (event.eventType !== 'CTE_RECEIVE_SHIP' && event.actorRegion !== region)) anomaly('Identity', 'IDENTITY', 'Invalid recorded actor role, MSP or region');
      if (lot.schemaVersion === 3) {
        if (!event.userId || event.actorId !== event.userId || !event.businessOrganizationId || !event.signerId) anomaly('Identity', 'USER_BUSINESS_IDENTITY', 'Recorded event lacks per-user certificate identity');
        try {this.validateBusiness({...lot,pendingToOrganizationId: pendingBusiness,currentHolderOrganizationId: holderBusiness}, event.eventType, event.businessOrganizationId || '');}
        catch {anomaly('Identity','BUSINESS_ORGANIZATION_DENIED','Recorded business organization is not assigned');}
        if (event.eventType === 'CTE_CREATE' && event.businessOrganizationId !== lot.ownerOrganizationId) anomaly('Identity','OWNER_ORGANIZATION','Creator differs from owner organization');
        const expectedFrom = event.eventType === 'CTE_HANDOVER_SHIP' ? event.businessOrganizationId : event.eventType === 'CTE_RECEIVE_SHIP' ? pendingFromBusiness : holderBusiness;
        if (event.fromOrganizationId !== expectedFrom) anomaly('Handover/History','FROM_ORGANIZATION','Handover sender differs from current holder');
        if (event.eventType === 'CTE_HANDOVER_SHIP') {
          pendingBusiness = event.toOrganizationId || ''; pendingFromBusiness = event.businessOrganizationId || '';
          if (!pendingBusiness || event.requestedBy !== event.userId || event.toOrganizationId !== event.data.toOrganizationId) anomaly('Handover/History','BUSINESS_DESTINATION','Missing business handover destination or requester');
        }
        if (event.eventType === 'CTE_RECEIVE_SHIP') {
          if (event.businessOrganizationId !== pendingBusiness || event.confirmedBy !== event.userId || event.toOrganizationId !== pendingBusiness) anomaly('Handover/History','BUSINESS_RECEIVER','Receiver business organization differs from pending');
          holderBusiness = event.businessOrganizationId || ''; holderUser = event.userId || ''; pendingBusiness = '';
        }
      }
      const currentTime = Date.parse(event.timestamp);
      if (!event.location?.trim() || event.lotId !== lotId || !Number.isFinite(currentTime) || currentTime < time || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) anomaly('Event', 'KDE', 'Invalid event metadata');
      if (event.integrityHash !== this.hashEvent({...event, integrityHash: ''})) anomaly('Data Integrity', 'HASH', 'Recorded event hash differs from content');
      if (event.data?.documentHash && event.data.documentHash !== event.dataHash) anomaly('Data Integrity', 'DOCUMENT_HASH', 'Document hash differs from event dataHash');
      if (event.eventType === 'CTE_HANDOVER_SHIP') {
        pendingOrg = event.toOrg;
        pendingRegion = String(event.data.toRegion || '');
        if (pendingOrg !== 'Org2MSP' || !pendingRegion.trim()) anomaly('Handover/History', 'TO_ORG', 'Invalid handover destination');
      }
      if (event.eventType === 'CTE_RECEIVE_SHIP') {
        if (event.actorOrg !== pendingOrg || event.actorRegion !== pendingRegion || !event.handoverConfirmed) anomaly('Handover/History', 'WRONG_RECEIVER', 'Invalid handover confirmation');
        region = event.actorRegion;
        pendingOrg = ''; pendingRegion = '';
      }
      status = rule?.to || status;
      previous = event.eventId;
      time = currentTime;
    }
    if (!history.length || lot.lastEventId !== previous || lot.status !== status || lot.eventCount !== history.length || lot.regionCode !== region) anomalies.push({step: 'Handover/History', code: 'LOT_HISTORY', message: 'Lot state differs from history'});
    if (lot.schemaVersion === 3 && (lot.currentHolderOrganizationId !== holderBusiness || (lot.pendingToOrganizationId || '') !== pendingBusiness || lot.currentHolder !== holderUser)) anomalies.push({step: 'Handover/History',code:'HOLDER_ORGANIZATION',message:'Final holder or pending organization differs from history'});
    return JSON.stringify({businessIdentityVerified: lot.schemaVersion === 3, valid: anomalies.length === 0, lotId, status: lot.status, checkedEvents: history.length, scope: lot.schemaVersion === 3 ? 'IESH_BUSINESS_IDENTITY' : 'LEGACY_IESH_METADATA', checks: ['identity', 'event', 'state', 'handover', 'previousEvent', 'hash'], anomalies});
  }

  // Research keys are separate from lots/events; a baseline can never accept a supply-chain event.
  @Transaction()
  public async BenchmarkWrite(ctx: Context, lotId: string, mode: string, nonce: string): Promise<string> {
    const actor=this.identity(ctx,'CTE_CREATE');
    const lot=JSON.parse(await this.QueryLot(ctx,lotId));
    if (!lotId.startsWith('QA-USER-') || lot.ownerOrganizationId!==actor.businessOrg || !/^[a-f0-9]{32}$/.test(nonce)) throw this.error('Identity','RESEARCH_SCOPE','Benchmark writes require an owned QA lot and unique nonce');
    const key=ctx.stub.createCompositeKey('research',[actor.userId,nonce]);
    if ((await ctx.stub.getState(key)).length) throw this.error('State','RESEARCH_DUPLICATE','Benchmark nonce already used');
    const result=JSON.parse(await this.BenchmarkHistory(ctx,lotId,mode));
    if (!result.valid) throw this.error('State','RESEARCH_INVALID','Research history is invalid');
    const receipt={lotId,mode,transactionId:ctx.stub.getTxID(),valid:true};
    await ctx.stub.putState(key,this.bytes(receipt));
    return JSON.stringify(receipt);
  }

  // Read-only comparison: baseline never bypasses validation on a ledger write.
  @Transaction(false)
  public async BenchmarkHistory(ctx: Context, lotId: string, mode: string): Promise<string> {
    if (!['HASH','IESH'].includes(mode)) throw this.error('Event','BENCHMARK_MODE','Expected HASH or IESH');
    const lot=JSON.parse(await this.QueryLot(ctx,lotId));
    if (lot.schemaVersion !== 4) throw this.error('Event','BENCHMARK_VERSION','Use a v4 research lot');
    const history=JSON.parse(await this.GetHistory(ctx,lotId));
    return JSON.stringify(mode==='HASH' ? workflow.baseline(history) : workflow.verify(lot,history));
  }

  @Transaction(false)
  @Returns('string')
  public async VerifyDocumentHash(ctx: Context, lotId: string, eventId: string, documentHash: string): Promise<string> {
    const events = JSON.parse(await this.GetHistory(ctx, lotId)) as TraceEvent[];
    const event = events.find(item => item.eventId === eventId);
    return JSON.stringify({valid: !!event && event.dataHash === documentHash, eventId, documentHash});
  }

  private async appendV4(ctx: Context, lot: ReturnType<typeof workflow.create>, eventType: string, location: string, data: Record<string, unknown>, previousEventId: string): Promise<void> {
    const actor = this.identity(ctx,eventType);
    const time = ctx.stub.getTxTimestamp();
    const receiving = workflow.confirmations.includes(eventType), sending = workflow.requests.includes(eventType);
    const event = {schemaVersion:4,docType:'traceEvent',eventId:ctx.stub.getTxID(),lotId:lot.lotId,eventType,timestamp:new Date(Number(time.seconds)*1000+Math.floor(time.nanos/1e6)).toISOString(),location,actorId:actor.id,userId:actor.userId,businessOrganizationId:actor.businessOrg,actorOrg:actor.org,actorRole:actor.role,actorRegion:actor.region,signerId:actor.signerId,previousEventId,data,dataHash:typeof data.documentHash === 'string' ? data.documentHash : workflow.hash(data),integrityHash:'',fromOrganizationId:receiving ? lot.pendingFromOrganizationId : lot.currentHolderOrganizationId,toOrganizationId:sending ? String(data.toOrganizationId || '') : receiving ? actor.businessOrg : '',requestedBy:sending ? actor.userId : '',confirmedBy:receiving ? actor.userId : '',handoverConfirmed:receiving};
    workflow.validate(lot,event);
    const key=ctx.stub.createCompositeKey('event',[lot.lotId,event.eventId]);
    if ((await ctx.stub.getState(key)).length) throw this.error('Handover/History','DUPLICATE_EVENT','Transaction already recorded');
    event.integrityHash=workflow.hash(event);
    workflow.apply(lot,event);
    await ctx.stub.putState(key,this.bytes(event));
    await ctx.stub.putState(this.lotKey(lot.lotId),this.bytes(lot));
    ctx.stub.setEvent('TraceEventRecorded',Buffer.from(JSON.stringify(event)));
  }

  private identity(ctx: Context, eventType: string): {id: string; org: string; role: Role; region: string; userId: string; businessOrg: string; signerId: string} {
    const org = ctx.clientIdentity.getMSPID();
    const userId = ctx.clientIdentity.getAttributeValue('userId') || '';
    const businessOrg = ctx.clientIdentity.getAttributeValue('businessOrganizationId') || '';
    const signerId = ctx.clientIdentity.getID();
    const id = userId;
    const certRole = (ctx.clientIdentity.getAttributeValue('role') || '').toUpperCase();
    const region = ctx.clientIdentity.getAttributeValue('region') || 'GLOBAL';
    if (certRole === 'ADMIN' || !certRole) throw this.error('Identity', 'ADMIN_OR_MISSING_ROLE', `Certificate cannot submit ${eventType}`);
    if (!['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'].includes(certRole)) throw this.error('Identity', 'ROLE_UNKNOWN', 'Certificate role is not a supply-chain role');
    const role = certRole as Role;
    const allowed = (org === 'Org1MSP' && (role === 'FARMER' || role === 'PROCESSOR')) ||
      (org === 'Org2MSP' && role === 'TRANSPORTER') || (org === 'Org3MSP' && role === 'DISTRIBUTOR');
    if (!allowed || !transitions[eventType as EventType]?.roles.includes(role)) throw this.error('Identity', 'RBAC_DENIED', `${org}/${role} cannot submit ${eventType}`);
    if (!userId || !businessOrg || userId.length > 120 || businessOrg.length > 80 || region === 'GLOBAL') throw this.error('Identity', 'USER_ORGANIZATION_REQUIRED', 'Certificate must bind userId, businessOrganizationId and region');
    return {id, org, role, region, userId, businessOrg, signerId};
  }

  private validateBusiness(lot: Lot, type: EventType, organizationId: string): void {
    let expected: string | undefined;
    if (type === 'CTE_CREATE') expected = lot.ownerOrganizationId;
    if (type === 'CTE_HARVEST') expected = lot.ownerOrganizationId;
    if (type === 'CTE_PROCESS' || type === 'CTE_HANDOVER_SHIP') expected = lot.processorOrganizationId;
    if (type === 'CTE_RECEIVE_SHIP') expected = lot.pendingToOrganizationId;
    if (type === 'CTE_DISPATCH_RETAIL' || type === 'CTE_DISPLAY_SALE') expected = lot.distributorOrganizationId;
    if (type === 'CTE_RECALL') {
      if (![lot.ownerOrganizationId,lot.processorOrganizationId,lot.distributorOrganizationId,lot.currentHolderOrganizationId,lot.pendingToOrganizationId].includes(organizationId)) throw this.error('Identity', 'BUSINESS_ORGANIZATION_DENIED', 'Organization has no relation to lot');
    } else if (!expected || expected !== organizationId) throw this.error('Identity', 'BUSINESS_ORGANIZATION_DENIED', 'Certificate business organization is not assigned to this operation');
  }

  @Transaction(false)
  public async GetCapabilities(_ctx: Context): Promise<string> {
    return JSON.stringify({schemaVersion: 4, workflowVersion: 4, perUserIdentity: true, businessOrganizationAuthorization: true, legacyReadOnly: true});
  }

  @Transaction(false)
  public async GetSignerIdentity(ctx: Context): Promise<string> {
    const role = (ctx.clientIdentity.getAttributeValue('role') || '').toUpperCase();
    const event: Record<string,string> = {FARMER: 'CTE_CREATE',PROCESSOR: 'CTE_PROCESS',TRANSPORTER: 'CTE_RECEIVE_SHIP',DISTRIBUTOR: 'CTE_DISPLAY_SALE'};
    return JSON.stringify(this.identity(ctx,event[role] || 'CTE_CREATE'));
  }

  private assertAdmin(ctx: Context): void {
    if (ctx.clientIdentity.getAttributeValue('role')?.toUpperCase() !== 'ADMIN') throw this.error('Identity', 'ADMIN_REQUIRED', 'Admin certificate is required');
  }

  private parseData(dataJson: string): Record<string, unknown> {
    try { const value = JSON.parse(dataJson || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required'); return value as Record<string, unknown>; } catch { throw this.error('Event', 'DATA_JSON', 'dataJson must be valid JSON'); }
  }

  private hashEvent(event: TraceEvent): string {
    return createHash('sha256').update(stringify(sortKeysRecursive({...event, integrityHash: ''}))).digest('hex');
  }
  private error(step: ValidationStep, code: string, message: string): Error { return new Error(JSON.stringify({step, code, message})); }
  private lotKey(lotId: string): string { return `lot:${lotId}`; }
  private bytes(value: unknown): Buffer { return Buffer.from(JSON.stringify(workflow.canonical(value))); }
}
