const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const storage = require('./storage');
const fabric = require('./fabric');
const enabled = process.env.IDENTITY_INTEGRATION === 'true' && /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE === process.env.MYSQL_TEST_DATABASE;
const onChain = process.env.FABRIC_ENABLED === 'true';
let server,base,admin;
const users = {}, tokens = {}, organizations = {};
const password = process.env.ADMIN_PASSWORD;
async function call(endpoint,token,method='GET',input) {
  const response = await fetch(base+endpoint,{method,headers:{'Connection':'close','Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(input?{body:JSON.stringify(input)}:{})});
  return {status:response.status,body:response.status===204?null:await response.json()};
}
async function login(username) {const result=await call('/auth/login',null,'POST',{username,password});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
before(async()=>{
  if (!enabled) return;
  await storage.connect();
  if (onChain) assert.equal((await fabric.readiness()).schemaVersion,4);
  server=require('./server').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api`;
  admin=(await login('test-admin')).token;
  for (const [name,type,mspId] of [['farm','FARM','Org1MSP'],['processor','PROCESSING_FACILITY','Org1MSP'],['logisticsA','LOGISTICS_COMPANY','Org2MSP'],['logisticsB','LOGISTICS_COMPANY','Org2MSP'],['distributor','DISTRIBUTION_COMPANY','Org3MSP']]) {
    const result=await call('/business-organizations',admin,'POST',{code:`QA-${name}`,name:`Doanh nghiệp QA ${name}`,type,mspId,email:`${name}@private.invalid`});assert.equal(result.status,201,JSON.stringify(result.body));organizations[name]=result.body;
  }
  for (const [name,role,company] of [['farmer','FARMER','farm'],['processor','PROCESSOR','processor'],['driverA1','TRANSPORTER','logisticsA'],['driverA2','TRANSPORTER','logisticsA'],['driverB','TRANSPORTER','logisticsB'],['distributor','DISTRIBUTOR','distributor']]) {
    const result=await call('/users',admin,'POST',{username:name,password,fullName:`Người dùng ${name}`,role,organizationId:organizations[company].organizationId,regionCode:'TG-001'});assert.equal(result.status,201,JSON.stringify(result.body));users[name]=result.body;tokens[name]=(await login(name)).token;
  }
  if (onChain) {
    const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/enroll-fabric-users.js'),'--test-database'],{cwd:path.join(__dirname,'..'),env:process.env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr || result.stdout);
  }
});
after(async()=>{if (!enabled) return;if(server)await new Promise(resolve=>server.close(resolve));await storage.close();await fabric.close();});
async function createLot() {
  const result=await call('/lots',tokens.farmer,'POST',{lotId:`QA-USER-${Date.now()}-${randomBytes(3).toString('hex')}`,productName:'Xoài kiểm thử danh tính',origin:'TG',harvestDate:'2026-11-06',location:'QA',regionCode:'TG-001',processorOrganizationId:organizations.processor.organizationId,distributorOrganizationId:organizations.distributor.organizationId,data:{}});
  assert.equal(result.status,201,JSON.stringify(result.body));return result.body;
}
async function event(lot,name,eventType,data={},endpoint='/events') {
  const result=await call(`/lots/${lot.lotId}${endpoint}`,tokens[name],'POST',{eventType,location:'QA',previousEventId:lot.lastEventId,data:{...(["CTE_HARVEST","CTE_PROCESS","CTE_DISPATCH_RETAIL"].includes(eventType)?{quantity:10,unit:"kg"}:{}),...(["CTE_PROCESS","CTE_DISPLAY_SALE"].includes(eventType)?{qualityResult:"PASS"}:{}),...data},...data});
  assert.equal(result.status,201,JSON.stringify(result.body));return result.body;
}
async function waiting() {
  let lot=await createLot();lot=await event(lot,'farmer','CTE_HARVEST');
  assert.equal((await call(`/lots/${lot.lotId}/events`,tokens.farmer,'POST',{eventType:'CTE_PROCESS',actorRole:'PROCESSOR',organizationId:organizations.processor.organizationId,location:'QA',previousEventId:lot.lastEventId})).status,403);
  if(onChain) await assert.rejects(fabric.submitEvent(lot.lotId,{eventType:'CTE_PROCESS',location:'QA',actorRole:'PROCESSOR',data:{},previousEventId:lot.lastEventId},users.farmer),error=>error.details?.some(detail=>detail.message.includes('RBAC_DENIED')));
  lot=await event(lot,'farmer','CTE_HANDOVER_PROCESSOR',{toOrganizationId:organizations.processor.organizationId,toRegion:'TG-001'},'/handover/request');
  lot=await event(lot,'processor','CTE_RECEIVE_PROCESSOR',{},'/handover/confirm');
  lot=await event(lot,'processor','CTE_PROCESS',{note:'PRIVATE-MARKER'});const holder=lot.currentHolder;
  lot=await event(lot,'processor','CTE_HANDOVER_SHIP',{toOrganizationId:organizations.logisticsA.organizationId,toRegion:'TG-001'},'/handover/request');assert.equal(lot.currentHolder,holder);return lot;
}
test('identity model: two companies share MSP, two drivers share company, all users have independent IDs and permissions', {skip:!enabled},async()=>{
  assert.equal(users.driverA1.organizationId,users.driverA2.organizationId);assert.notEqual(users.driverA1.userId,users.driverA2.userId);
  assert.equal(users.driverA1.orgMsp,users.driverB.orgMsp);assert.notEqual(users.driverA1.organizationId,users.driverB.organizationId);
  const me=(await call('/auth/me',admin)).body;assert.equal(me.role,'SUPER_ADMIN');assert.ok(!me.permissions.includes('HANDOVER_CONFIRM'));
  assert.equal((await call('/users',tokens.farmer)).status,403);
  assert.equal((await call('/users',admin,'POST',{username:'driverA1',password,role:'TRANSPORTER',organizationId:users.driverA1.organizationId,regionCode:'TG-001'})).status,409);
  const listing=(await call('/business-organizations',tokens.driverA1)).body;assert.equal(listing.find(org=>org.organizationId===users.driverB.organizationId).email,undefined);
  const accounts=(await call('/users',admin)).body;assert.ok(accounts.every(user=>!('passwordHash' in user) && !('privateKeyReference' in user)));
  if(onChain) {
    const identities=(await call('/admin/fabric-identities',admin)).body;
    const a=identities.find(identity=>identity.userId===users.driverA1.userId),b=identities.find(identity=>identity.userId===users.driverA2.userId);
    assert.ok(a && b);assert.notEqual(a.enrollmentId,b.enrollmentId);assert.notEqual(a.fingerprint,b.fingerprint);
  }
});
test('priority: FARMER cannot PROCESS; company B cannot confirm company A; valid flow, holders, history and public QR', {skip:!enabled,timeout:180000},async()=>{
  let lot=await waiting();
  assert.equal((await call(`/lots/${lot.lotId}`,tokens.driverB)).status,403);
  assert.equal((await call(`/lots/${lot.lotId}/handover/confirm`,tokens.driverB,'POST',{location:'QA',previousEventId:lot.lastEventId,data:{toOrganizationId:users.driverA1.organizationId,userId:users.driverA1.userId}})).status,403);
  assert.equal((await call(`/lots/${lot.lotId}/handover/confirm`,admin,'POST',{location:'QA',previousEventId:lot.lastEventId})).status,403);
  if(onChain) await assert.rejects(fabric.submitEvent(lot.lotId,{eventType:'CTE_RECEIVE_SHIP',location:'QA',actorRole:'TRANSPORTER',previousEventId:lot.lastEventId,data:{}},users.driverB),error=>error.details?.some(detail=>detail.message.includes('WRONG_RECEIVER')));
  lot=await event(lot,'driverA1','CTE_RECEIVE_SHIP',{},'/handover/confirm');assert.equal(lot.currentHolder,users.driverA1.userId);assert.equal(lot.currentHolderOrganizationId,users.driverA1.organizationId);
  lot=await event(lot,'driverA1','CTE_HANDOVER_RETAIL',{toOrganizationId:organizations.distributor.organizationId,toRegion:'TG-001'},'/handover/request');
  lot=await event(lot,'distributor','CTE_DISPATCH_RETAIL');lot=await event(lot,'distributor','CTE_DISPLAY_SALE');assert.equal(lot.status,'READY_FOR_SALE');assert.equal(lot.events.length,10);
  const verification=(await call(`/lots/${lot.lotId}/validate`,admin)).body;assert.equal(verification.valid,true,JSON.stringify(verification));
  if(onChain) {
    const history=await fabric.history(lot.lotId);assert.ok(history.every(event=>/^[a-f0-9]{64}$/.test(event.eventId) && event.userId && event.businessOrganizationId && event.signerId));
    assert.equal(history[6].userId,users.driverA1.userId);assert.equal(history[6].businessOrganizationId,users.driverA1.organizationId);
  }
  const audit=(await call(`/admin/activity?userId=${users.driverA1.userId}`,admin)).body;assert.ok(audit.some(entry=>entry.action==='CTE_RECEIVE_SHIP' && entry.organizationId===users.driverA1.organizationId));
  const publicLot=(await call(`/public/trace/${lot.lotId}`)).body;assert.equal(publicLot.integrity.valid,true);assert.equal(publicLot.organizations.length,4);
  const text=JSON.stringify(publicLot);for(const hidden of ['PRIVATE-MARKER','private.invalid','privateKey','signerId','actorId']) assert.equal(text.includes(hidden),false);
  assert.equal((await fetch(`${base}/lots/${lot.lotId}/qr`)).status,200);
  const monitor=(await call('/admin/transactions',admin)).body;
  if (onChain) assert.ok(monitor.items.some(item=>item.lotId===lot.lotId && item.status==='COMMITTED_VALID' && item.userId));
  lot=await event(lot,'distributor','CTE_RECALL',{note:'PRIVATE-RECALL'},'/recall');
  assert.equal(lot.status,'RECALLED');
  assert.equal((await call(`/lots/${lot.lotId}/recall`,tokens.distributor,'POST',{location:'QA',previousEventId:lot.lastEventId})).status,409);
  const recalled=(await call(`/public/trace/${lot.lotId}`)).body;assert.equal(recalled.status,'RECALLED');assert.equal(JSON.stringify(recalled).includes('PRIVATE-RECALL'),false);
});
test('research: real committed transactions, query validation baseline and resource samples', {skip:!enabled || !onChain || process.env.TRACE_BENCHMARK!=='true',timeout:300000},async()=>{
  const {performance}=require('node:perf_hooks'),fs=require('node:fs');
  const definition=spawnSync('bash',['-c','export PATH="$PWD/../bin:$PATH" FABRIC_CFG_PATH="$PWD/../config" OVERRIDE_ORG="" VERBOSE=false; source scripts/envVar.sh; setGlobals 1 >/dev/null; peer lifecycle chaincode querycommitted -C tracechannel-v2 -n traceability_v2 --output json'],{cwd:path.join(__dirname,'../fabric-samples/test-network'),encoding:'utf8'});
  assert.equal(definition.status,0,'Cannot verify the deployed chaincode definition');
  const deployedVersion=JSON.parse(definition.stdout).version;
  assert.equal(deployedVersion,'4.3','Deploy version 4.3 before measuring this workload');
  const gateway=[],queries=[],baseline=[],iesh=[],baselineCommits=[],ieshCommits=[],resources=[];
  const originalCreate=fabric.submitCreateLot,originalEvent=fabric.submitEvent;
  const timed=fn=>async(...args)=>{const start=performance.now();const result=await fn(...args);gateway.push(performance.now()-start);return result;};
  fabric.submitCreateLot=timed(originalCreate);fabric.submitEvent=timed(originalEvent);
  let valid=0,rejected=0,unauthorized=0,last;const chaincodeProbes=[];
  const started=performance.now();
  try {
    for(let round=0;round<3;round++) {
      let lot=await waiting();
      const bad=[['farmer','CTE_PROCESS'],['driverB','CTE_RECEIVE_SHIP'],['driverA1','CTE_DISPLAY_SALE']];
      for(const [name,eventType] of bad){const result=await call(`/lots/${lot.lotId}/events`,tokens[name],'POST',{eventType,location:'QA',previousEventId:lot.lastEventId,data:{}});if([403,409].includes(result.status))rejected++;if(name==='driverB'&&result.status===403)unauthorized++;}
      for(const [name,type,previous,location] of [['farmer','CTE_PROCESS',lot.lastEventId,'QA'],['driverB','CTE_RECEIVE_SHIP',lot.lastEventId,'QA'],['driverA1','CTE_RECEIVE_SHIP','stale-head','QA'],['distributor','CTE_DISPLAY_SALE',lot.lastEventId,'QA'],['driverA1','CTE_RECEIVE_SHIP',lot.lastEventId,'']]) {
        await assert.rejects(fabric.submitEvent(lot.lotId,{eventType:type,actorRole:users[name].role,location,previousEventId:previous,data:{}},users[name]));chaincodeProbes.push({type,rejected:true});
      }
      lot=await event(lot,'driverA1','CTE_RECEIVE_SHIP',{},'/handover/confirm');
      await assert.rejects(fabric.submitEvent(lot.lotId,{eventType:'CTE_RECEIVE_SHIP',actorRole:'TRANSPORTER',location:'QA',previousEventId:lot.lastEventId,data:{}},users.driverA1));chaincodeProbes.push({type:'DUPLICATE_CONFIRM',rejected:true});
      lot=await event(lot,'driverA1','CTE_TRANSPORT',{temperature:8,humidity:70});
      lot=await event(lot,'driverA1','CTE_HANDOVER_RETAIL',{toOrganizationId:organizations.distributor.organizationId,toRegion:'TG-001'},'/handover/request');
      lot=await event(lot,'distributor','CTE_DISPATCH_RETAIL');lot=await event(lot,'distributor','CTE_DISPLAY_SALE');
      valid++;last=lot;
      const start=performance.now();await fabric.history(lot.lotId);queries.push(performance.now()-start);
      const contract=await fabric.connect();
      // Alternate ordering to reduce cache/warmup bias; these are verification queries, not write transactions.
      for(const mode of round%2?['IESH','HASH']:['HASH','IESH']) {const start=performance.now();const result=JSON.parse(Buffer.from(await contract.evaluateTransaction('BenchmarkHistory',lot.lotId,mode)).toString());assert.equal(result.valid,true);(mode==='HASH'?baseline:iesh).push(performance.now()-start);}
      const writer=await fabric.connect(users.farmer);
      for(const mode of round%2?['IESH','HASH']:['HASH','IESH']) {const start=performance.now();await writer.submitTransaction('BenchmarkWrite',lot.lotId,mode,randomBytes(16).toString('hex'));(mode==='HASH'?baselineCommits:ieshCommits).push(performance.now()-start);}
      const stats=await require('node:util').promisify(require('node:child_process').execFile)('docker',['stats','--no-stream','--format','{{json .}}'],{encoding:'utf8'});resources.push(...stats.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(row=>/tracechain|peer0|orderer/.test(row.Name)).map(row=>({container:row.Name,cpu:row.CPUPerc,memory:row.MemUsage})));
    }
  }finally {fabric.submitCreateLot=originalCreate;fabric.submitEvent=originalEvent;}
  const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.ceil(values.length*.5)-1],p95:sorted[Math.ceil(values.length*.95)-1],p99:sorted[Math.ceil(values.length*.99)-1]};};
  const elapsedMs=performance.now()-started;
  const report={generatedAt:new Date().toISOString(),environment:{node:process.version,cpu:require('node:os').cpus()[0]?.model,cpuCount:require('node:os').cpus().length,memoryBytes:require('node:os').totalmem(),chaincodeVersion:deployedVersion,organizations:3},scope:'Isolated QA database; real Fabric commits. Three sequential lots, not a saturation/load-capacity claim.',gatewayCommitLatencyMs:summary(gateway),historyQueryLatencyMs:summary(queries),historyHashBaselineMs:summary(baseline),historyIeshMs:summary(iesh),benchmarkWriteHashBaselineMs:summary(baselineCommits),benchmarkWriteIeshMs:summary(ieshCommits),benchmarkWriteOverheadPercent:(summary(ieshCommits).mean/summary(baselineCommits).mean-1)*100,historyValidationOverheadPercent:(summary(iesh).mean/summary(baseline).mean-1)*100,throughputCommittedTps:gateway.length/(elapsedMs/1000),measurementElapsedMs:elapsedMs,validLots:valid,validTransactionSubmissions:33,committedTransactions:gateway.length,transactionSuccessRate:gateway.length/33,chaincodeViolationDetection:{detected:chaincodeProbes.length,total:18,rate:chaincodeProbes.length/18},ieshViolationDetection:{detected:rejected,total:9,rate:rejected/9},unauthorizedRejection:{rejected:unauthorized,total:3,rate:unauthorized/3},resources,example:{lotId:last.lotId,lastTransactionId:last.lastEventId,eventCount:last.eventCount},limitations:['TPS includes negative tests, queries and resource sampling between sequential flows.','Write overhead compares full-history IESH versus hash checks with identical research-key writes; it is not an ablation of production CTE validation.','Small sample; no statistical significance or production capacity claim.','Other Docker workloads were running on the same host; this was not a dedicated performance environment.']};
  fs.mkdirSync(path.join(__dirname,'../reports'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../reports/fabric-benchmark.json'),JSON.stringify(report,null,2));
  const csv=[['metric','value'],...Object.entries(report).filter(([,value])=>typeof value==='number').map(([key,value])=>[key,value]),...Object.entries(report.gatewayCommitLatencyMs).map(([key,value])=>['gatewayCommitLatencyMs.'+key,value])];
  fs.writeFileSync(path.join(__dirname,'../reports/fabric-benchmark.csv'),csv.map(row=>row.join(',')).join('\n')+'\n');
  assert.equal(gateway.length,33);assert.equal(chaincodeProbes.length,18);assert.equal(valid,3);assert.equal(rejected,9);assert.equal(unauthorized,3);console.log('Measured Fabric benchmark saved to reports/fabric-benchmark.json');
});
test('second driver in same company signs independently; disabling account and company revokes application access', {skip:!enabled,timeout:180000},async()=>{
  let lot=await waiting();lot=await event(lot,'driverA2','CTE_RECEIVE_SHIP',{},'/handover/confirm');assert.equal(lot.currentHolder,users.driverA2.userId);
  if(onChain) assert.equal((await fabric.history(lot.lotId)).at(-1).userId,users.driverA2.userId);
  const audit=(await call(`/admin/activity?userId=${users.driverA2.userId}`,admin)).body;assert.ok(audit.some(entry=>entry.action==='CTE_RECEIVE_SHIP'));
  assert.equal((await call('/users/driverA2/status',admin,'PATCH',{status:'INACTIVE'})).status,200);
  assert.equal((await call('/auth/me',tokens.driverA2)).status,401);assert.equal((await call('/auth/login',null,'POST',{username:'driverA2',password})).status,401);
  assert.equal((await call('/users/driverA2/status',admin,'PATCH',{status:'ACTIVE'})).status,200);tokens.driverA2=(await login('driverA2')).token;
  assert.equal((await call(`/business-organizations/${users.driverA2.organizationId}`,admin,'PATCH',{status:'INACTIVE'})).status,200);
  assert.equal((await call('/auth/me',tokens.driverA2)).status,401);assert.equal((await call('/auth/me',tokens.driverA1)).status,401);
  if(onChain) assert.equal((await call('/admin/fabric-identities',admin)).body.find(identity=>identity.userId===users.driverA2.userId).status,'ACTIVE');
});
test('Fabric regression: commit then SQL failure reconciles once without another transaction', {skip:!enabled || !onChain,timeout:90000},async()=>{
  const save=storage.saveLot;let id;
  storage.saveLot=async lot=>{id=lot.lotId;throw new Error('Injected SQL failure after commit');};
  try{
    const result=await call('/lots',tokens.farmer,'POST',{lotId:`QA-RECOVER-${Date.now()}`,productName:'QA',origin:'TG',harvestDate:'2026-11-06',location:'QA',regionCode:'TG-001',processorOrganizationId:organizations.processor.organizationId,distributorOrganizationId:organizations.distributor.organizationId});assert.equal(result.status,503);
  }finally{storage.saveLot=save;}
  const original=await fabric.readLot(id);assert.equal(await storage.getLot(id),null);
  const result=await call(`/fabric/lots/${id}/reconcile`,tokens.farmer,'POST',{});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.lastEventId,original.lastEventId);assert.equal((await fabric.history(id)).length,1);
});
test('Fabric regression: simultaneous writers form one valid branch and SQL tampering is detected', {skip:!enabled || !onChain,timeout:90000},async()=>{
  const original=await createLot();const body={eventType:'CTE_HARVEST',location:'QA',previousEventId:original.lastEventId,data:{quantity:10,unit:'kg'}};
  const results=await Promise.all([call(`/lots/${original.lotId}/events`,tokens.farmer,'POST',body),call(`/lots/${original.lotId}/events`,tokens.farmer,'POST',body)]);
  assert.equal(results.filter(result=>result.status===201).length,1,JSON.stringify(results));assert.equal(results.filter(result=>result.status===409).length,1,JSON.stringify(results));
  const lot=await storage.getLot(original.lotId);assert.equal(lot.events.length,2);assert.equal((await fabric.history(lot.lotId)).length,2);
  const db=await require('mysql2/promise').createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try{await db.execute('UPDATE trace_events SET location=? WHERE event_id=?',['TAMPERED-QA',lot.lastEventId]);const result=(await call(`/lots/${lot.lotId}/validate`,admin)).body;assert.equal(result.valid,false);assert.ok(result.anomalies.some(item=>item.code==='MYSQL_EVENT'));assert.equal((await fabric.history(lot.lotId)).at(-1).location,'QA');}
  finally{await db.end();}
});
