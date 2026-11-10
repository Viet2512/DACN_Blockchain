const test = require('node:test');
const assert = require('node:assert/strict');
const {TraceabilityContract} = require('../dist/traceability');

function context(role, msp = 'Org1MSP') {
  const state = new Map();
  let tx = 0;
  let currentRole = role;
  let seconds = 1730000000;
  const business = {FARMER:'farm-A',PROCESSOR:'processor-A',TRANSPORTER:'logistics-A',DISTRIBUTOR:'distributor-A'};
  let organization = business[role];
  let user = `${role}-user`;
  return {
    clientIdentity: {
      getMSPID: () => msp,
      getID: () => `x509::${msp}/${user}/${organization}`,
      getAttributeValue: (name) => name === 'role' ? currentRole : name === 'region' ? 'TG-001' : name === 'userId' ? user : name === 'businessOrganizationId' ? organization : undefined,
    },
    stub: {
      getState: async (key) => state.get(key) || Buffer.alloc(0),
      putState: async (key, value) => state.set(key, value),
      getTxID: () => `tx-${++tx}`,
      getTxTimestamp: () => ({seconds, nanos: 0}),
      createCompositeKey: (type, parts) => `${type}:${parts.join(':')}`,
      setEvent: () => {},
      getStateByPartialCompositeKey: async (type, parts) => {
        const rows = [...state].filter(([key]) => key.startsWith(`${type}:${parts.join(':')}:`)).sort(([a], [b]) => b.localeCompare(a));
        let index = 0;
        return {next: async () => index < rows.length ? {done: false, value: {value: rows[index++][1]}} : {done: true}, close: async () => {}};
      },
    },
    setRole: (nextRole, org = msp) => { currentRole = nextRole; msp = org; organization = business[nextRole]; user = `${nextRole}-user`; },
    setUser: (id, org) => {user = id; organization = org;},
    setTime: value => {seconds=value;},
    state,
  };
}

const workflow=require('../dist/workflow');
const setup=async(id='LOT')=>{const contract=new TraceabilityContract(),ctx=context('FARMER');const lot=JSON.parse(await contract.CreateLot(ctx,id,'Xoai','TG','2026-01-01','GPS','TG-001',JSON.stringify({processorOrganizationId:'processor-A',distributorOrganizationId:'distributor-A'})));return {contract,ctx,lot};};
const steps=[
 ['FARMER','CTE_HARVEST',{quantity:10,unit:'kg'}],
 ['FARMER','CTE_HANDOVER_PROCESSOR',{toOrg:'Org1MSP',toRegion:'TG-001',toOrganizationId:'processor-A'}],
 ['PROCESSOR','CTE_RECEIVE_PROCESSOR',{}],
 ['PROCESSOR','CTE_PROCESS',{quantity:9,unit:'kg',qualityResult:'PASS'}],
 ['PROCESSOR','CTE_HANDOVER_SHIP',{toOrg:'Org2MSP',toRegion:'TG-001',toOrganizationId:'logistics-A'}],
 ['TRANSPORTER','CTE_RECEIVE_SHIP',{}],
 ['TRANSPORTER','CTE_HANDOVER_RETAIL',{toOrg:'Org3MSP',toRegion:'TG-001',toOrganizationId:'distributor-A'}],
 ['DISTRIBUTOR','CTE_DISPATCH_RETAIL',{quantity:9,unit:'kg'}],
 ['DISTRIBUTOR','CTE_DISPLAY_SALE',{qualityResult:'PASS'}],
];
async function step(c,ctx,lot,[role,type,data]){ctx.setRole(role,workflow.msps[role]);return JSON.parse(await c.RecordEvent(ctx,lot.lotId,type,'GPS',role,JSON.stringify(data),lot.lastEventId));}
test('admin and forged role are rejected by certificate identity',async()=>{
 const c=new TraceabilityContract();await assert.rejects(c.CreateLot(context('ADMIN'),'x','x','x','2026-01-01','GPS','TG-001','{}'),/ADMIN_OR_MISSING_ROLE/);
 const {contract,ctx,lot}=await setup();await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_PROCESS','GPS','PROCESSOR','{}',lot.lastEventId),/RBAC_DENIED/);
});
test('three two-party handovers preserve the sender until the actual receiver signs; replay and recall',async()=>{
 let {contract,ctx,lot}=await setup();
 for(const entry of steps){const before=lot.currentHolder;lot=await step(contract,ctx,lot,entry);if(workflow.requests.includes(entry[1]))assert.equal(lot.currentHolder,before);if(workflow.confirmations.includes(entry[1]))assert.equal(lot.currentHolder,`${entry[0]}-user`);const verification=JSON.parse(await contract.ValidateTraceHistory(ctx,lot.lotId));assert.equal(verification.valid,true,JSON.stringify(verification));}
 assert.equal(lot.eventCount,10);assert.equal(lot.currentHolderOrganizationId,'distributor-A');
 ctx.setRole('FARMER','Org1MSP');lot=JSON.parse(await contract.RecordEvent(ctx,lot.lotId,'CTE_RECALL','GPS','FARMER',JSON.stringify({note:'Contamination'}),lot.lastEventId));
 await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_RECALL','GPS','FARMER',JSON.stringify({note:'Again'}),lot.lastEventId),/FSM_INVALID/);
 assert.equal(JSON.parse(await contract.ValidateTraceHistory(ctx,lot.lotId)).valid,true);
});
test('wrong organization in same MSP, no request, stale head and duplicate confirmation cannot transfer custody',async()=>{
 let {contract,ctx,lot}=await setup();ctx.setRole('PROCESSOR');await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_RECEIVE_PROCESSOR','GPS','PROCESSOR','{}',lot.lastEventId),/FSM_INVALID/);
 lot=await step(contract,ctx,lot,steps[0]);lot=await step(contract,ctx,lot,steps[1]);ctx.setRole('PROCESSOR');ctx.setUser('intruder','processor-B');await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_RECEIVE_PROCESSOR','GPS','PROCESSOR','{}',lot.lastEventId),/WRONG_RECEIVER/);
 ctx.setRole('PROCESSOR');await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_RECEIVE_PROCESSOR','GPS','PROCESSOR','{}','old'),/PREVIOUS_EVENT/);
 lot=await step(contract,ctx,lot,steps[2]);await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_RECEIVE_PROCESSOR','GPS','PROCESSOR','{}',lot.lastEventId),/FSM_INVALID/);
});
test('KDE and document hashes are checked before writes',async()=>{
 const {contract,ctx,lot}=await setup();
 for(const data of [{},{quantity:-1,unit:'kg'},{quantity:1,unit:'unknown'},{quantity:1,unit:'kg',documentHash:'fake'},{quantity:1,unit:'kg',privateKey:'forbidden'}])await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_HARVEST','GPS','FARMER',JSON.stringify(data),lot.lastEventId));
 await assert.rejects(contract.CreateLot(ctx,'bad','x','TG','2026-01-01','GPS','TG-001',JSON.stringify({processorOrganizationId:'processor-A',distributorOrganizationId:'distributor-A',documentHash:'a'.repeat(64)})),/DATA_FIELD/);
 assert.equal((await contract.GetHistory(ctx,lot.lotId)).includes('CTE_HARVEST'),false);
});
test('quality and monotonic timestamp cannot be bypassed; pending receiver and holder tampering are detected',async()=>{
 let {contract,ctx,lot}=await setup();lot=await step(contract,ctx,lot,steps[0]);lot=await step(contract,ctx,lot,steps[1]);lot=await step(contract,ctx,lot,steps[2]);
 await assert.rejects(contract.RecordEvent(ctx,lot.lotId,'CTE_PROCESS','GPS','PROCESSOR',JSON.stringify({quantity:9,unit:'kg',qualityResult:'FAIL'}),lot.lastEventId),/QUALITY/);
 ctx.setTime(1720000000);await assert.rejects(step(contract,ctx,lot,steps[3]),/TIMESTAMP/);ctx.setTime(1730000000);
 const key='lot:'+lot.lotId;const saved=ctx.state.get(key);ctx.state.set(key,Buffer.from(JSON.stringify({...lot,currentHolderOrganizationId:'fake'})));assert.equal(JSON.parse(await contract.ValidateTraceHistory(ctx,lot.lotId)).valid,false);ctx.state.set(key,saved);
 const eventKey=[...ctx.state.keys()].find(k=>k.startsWith('event:'));const event=JSON.parse(ctx.state.get(eventKey));event.actorOrg='FakeMSP';ctx.state.set(eventKey,Buffer.from(JSON.stringify(event)));const result=JSON.parse(await contract.ValidateTraceHistory(ctx,lot.lotId));assert.equal(result.valid,false);assert.ok(result.anomalies.length);
});
test('legacy lot can be queried but never rewritten',async()=>{
 const {contract,ctx,lot}=await setup();ctx.state.set('lot:LOT',Buffer.from(JSON.stringify({...lot,schemaVersion:3})));
 assert.equal(JSON.parse(await contract.QueryLot(ctx,'LOT')).schemaVersion,3);
 await assert.rejects(step(contract,ctx,lot,steps[0]),/LEGACY_READ_ONLY/);
});
test('hash-intact false business history passes hash baseline but fails IESH replay',async()=>{
 const {contract,ctx,lot}=await setup('RESEARCH-CONTROL');
 const history=JSON.parse(await contract.GetHistory(ctx,lot.lotId));
 history[0].eventType='CTE_DISPLAY_SALE';history[0].data={qualityResult:'PASS'};
 history[0].dataHash=workflow.hash(history[0].data);history[0].integrityHash=workflow.hash({...history[0],integrityHash:''});
 assert.equal(workflow.baseline(history).valid,true);
 const result=workflow.verify(lot,history);assert.equal(result.valid,false);assert.ok(result.anomalies.some(row=>row.code==='RBAC_DENIED'||row.code==='FSM_INVALID'));
});
test('benchmark mode cannot disable write validation',async()=>{
 const {contract,ctx,lot}=await setup('BASELINE');
 assert.equal(JSON.parse(await contract.BenchmarkHistory(ctx,lot.lotId,'HASH')).valid,true);
 assert.equal(JSON.parse(await contract.BenchmarkHistory(ctx,lot.lotId,'IESH')).valid,true);
 await assert.rejects(contract.SetValidationMode(ctx,'false'));
 await assert.rejects(contract.BenchmarkHistory(ctx,lot.lotId,'unsafe'),/BENCHMARK_MODE/);
});
test('research baseline commits only separate research keys and cannot change a lot',async()=>{
 const {contract,ctx,lot}=await setup('QA-USER-BENCHMARK');
 const before=await contract.QueryLot(ctx,lot.lotId);
 for(const [mode,nonce] of [['HASH','a'.repeat(32)],['IESH','b'.repeat(32)]])assert.equal(JSON.parse(await contract.BenchmarkWrite(ctx,lot.lotId,mode,nonce)).valid,true);
 assert.equal(await contract.QueryLot(ctx,lot.lotId),before);assert.equal(JSON.parse(await contract.GetHistory(ctx,lot.lotId)).length,1);
 await assert.rejects(contract.BenchmarkWrite(ctx,lot.lotId,'HASH','a'.repeat(32)),/RESEARCH_DUPLICATE/);
 const ordinary=await setup('PRODUCTION');await assert.rejects(ordinary.contract.BenchmarkWrite(ordinary.ctx,ordinary.lot.lotId,'HASH','a'.repeat(32)),/RESEARCH_SCOPE/);
});
test('lot IDs have one canonical ledger key matching the SQL identity domain',async()=>{
 const {contract,ctx,lot}=await setup('mixed-Case');assert.equal(lot.lotId,'MIXED-CASE');
 await assert.rejects(contract.CreateLot(ctx,'Mixed-Case','Xoai','TG','2026-01-01','GPS','TG-001',JSON.stringify({processorOrganizationId:'processor-A',distributorOrganizationId:'distributor-A'})),/LOT_EXISTS/);
 await assert.rejects(setup('LÔ-1'),/LOT_ID/);
});
