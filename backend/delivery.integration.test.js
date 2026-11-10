const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {performance}=require('node:perf_hooks');
const fs=require('node:fs'),path=require('node:path');
const mysql=require('mysql2/promise');
const storage=require('./storage'),fabric=require('./fabric'),workflow=require('../chaincode/src/workflow');
const root=path.join(__dirname,'..');
const enabled=process.env.DELIVERY_INTEGRATION==='true' && /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE===process.env.MYSQL_TEST_DATABASE;
const browser=process.env.DELIVERY_BROWSER==='true';
const password=randomBytes(24).toString('hex');
const companies={},admins={},tokens={},users={};
const evidence={checkedAt:new Date().toISOString(),source:'FABRIC',commits:[],rejections:[],checks:{}};
let server,base,db,system,lot;
const fixtures=[['farm','FARM','Org1MSP','FARMER'],['processor','PROCESSING_FACILITY','Org1MSP','PROCESSOR'],['driver','LOGISTICS_COMPANY','Org2MSP','TRANSPORTER'],['otherDriver','LOGISTICS_COMPANY','Org2MSP','TRANSPORTER'],['distributor','DISTRIBUTION_COMPANY','Org3MSP','DISTRIBUTOR']];
async function call(endpoint,token,method='GET',body){const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:response.status===204?null:await response.json()};}
async function login(username,secret=password){const result=await call('/auth/login',null,'POST',{username,password:secret});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
async function invite(actor,username,role,organizationId){const invited=await call('/users/invitations',actor,'POST',{username,role,organizationId,email:`${username}@qa.invalid`,fullName:`Kiểm thử ${username}`,regionCode:'TG-001'});assert.equal(invited.status,201,JSON.stringify(invited.body));assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invited.body.activationToken,password})).status,204);return login(username);}
async function deny(name,endpoint,token,body,status){const result=await call(endpoint,token,'POST',body);assert.equal(result.status,status,JSON.stringify(result.body));evidence.rejections.push({name,source:'API',status:result.status,code:result.body.code});}
async function deniedByLedger(name,who,eventType,code){await assert.rejects(fabric.submitEvent(lot.lotId,{eventType,actorRole:users[who].role,location:'QA',previousEventId:lot.lastEventId,data:{}},users[who]),error=>error.details?.some(detail=>detail.message.includes(code)));evidence.rejections.push({name,source:'CHAINCODE',code});}
async function record(who,eventType,data={},destination){const endpoint=workflow.requests.includes(eventType)?'handover/request':workflow.confirmations.includes(eventType)?'handover/confirm':'events';const start=performance.now();const result=await call(`/lots/${lot.lotId}/${endpoint}`,tokens[who],'POST',{eventType,location:'Địa điểm QA',previousEventId:lot.lastEventId,data,...(destination?{toOrganizationId:companies[destination],toRegion:'TG-001'}:{})});assert.equal(result.status,201,JSON.stringify(result.body));lot=result.body;assert.match(lot.lastEventId,/^[a-f0-9]{64}$/);evidence.commits.push({eventType,transactionId:lot.lastEventId,status:lot.status,apiCommitLatencyMs:Math.round(performance.now()-start)});return lot;}
before(async()=>{
 if(!enabled)return;
 assert.equal(process.env.FABRIC_ENABLED,'true');await storage.connect();assert.equal((await fabric.readiness()).ready,true);
 db=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
 server=require('./server').listen(browser?18180:0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base=`http://127.0.0.1:${server.address().port}/api`;
 system=(await login('test-admin',process.env.ADMIN_PASSWORD)).token;
 for(const [name,type,mspId] of fixtures){const organization=await call('/business-organizations',system,'POST',{code:`DELIVERY-${name}`,name:`Doanh nghiệp QA ${name}`,type,mspId});assert.equal(organization.status,201,JSON.stringify(organization.body));companies[name]=organization.body.organizationId;admins[name]=(await invite(system,`boss-${name}`,'BUSINESS_ADMIN',companies[name])).token;}
 for(const [name,,,role] of fixtures){const user=await invite(admins[name],name,role);users[name]=user.user;tokens[name]=user.token;assert.equal((await call(`/users/${name}/fabric-identity/request`,admins[name],'POST')).status,204);}
 await assert.rejects(storage.getSigningIdentity(users.farm),{code:'FABRIC_IDENTITY_REQUIRED'});
 const enrollment=spawnSync(process.execPath,['scripts/enroll-fabric-users.js','--test-database','--pending'],{cwd:root,env:process.env,encoding:'utf8'});assert.equal(enrollment.status,0,enrollment.stderr);
 evidence.checks.hierarchyAndActivation=true;evidence.checks.perUserEnrollment=true;evidence.checks.missingIdentityRejected=true;
});
after(async()=>{
 if(!enabled)return;
 try {
 if(browser && evidence.checks.seedRetryPreservesAccountsAndDisabledSigners && evidence.checks.hashIntactBusinessInvalidDetected){
  const fixture=path.join(root,'backups/delivery-browser.json'),done=path.join(root,'backups/delivery-browser.done');
  fs.rmSync(done,{force:true});fs.writeFileSync(fixture,JSON.stringify({base,password,lotId:lot.lotId,companies,staff:fixtures.map(([username])=>username)}),{mode:0o600});
  console.log('Isolated browser QA ready: API 18180. Credentials retained only in ignored private fixture.');
  try{await new Promise((resolve,reject)=>{const started=Date.now();const timer=setInterval(()=>{if(fs.existsSync(done)){clearInterval(timer);resolve();}else if(Date.now()-started>600000){clearInterval(timer);reject(new Error('Browser QA timed out'));}},1000);});}
  finally{fs.rmSync(fixture,{force:true});fs.rmSync(done,{force:true});}
 }
 } finally {
  if(server)await new Promise(resolve=>server.close(resolve));await storage.close();if(db)await db.end();await fabric.close();
 }
},{timeout:660000});
test('delivery: hierarchy to full 11-event supply chain, committed ledger history and public QR',{skip:!enabled,timeout:180000},async()=>{
 const input={lotId:`QA-DELIVERY-${randomBytes(8).toString('hex')}`,productName:'Xoài QA nghiệm thu',origin:'Tiền Giang',harvestDate:'2026-11-09',location:'Vùng trồng QA',regionCode:'TG-001',processorOrganizationId:companies.processor,distributorOrganizationId:companies.distributor};
 await deny('system cannot produce','/lots',system,input,403);await deny('business admin cannot produce','/lots',admins.farm,input,403);
 const start=performance.now(),created=await call('/lots',tokens.farm,'POST',input);assert.equal(created.status,201,JSON.stringify(created.body));lot=created.body;assert.equal(lot.source,'FABRIC');evidence.commits.push({eventType:'CTE_CREATE',transactionId:lot.lastEventId,status:lot.status,apiCommitLatencyMs:Math.round(performance.now()-start)});
 await deny('duplicate lot','/lots',tokens.farm,input,409);
 await deniedByLedger('wrong role on ledger','farm','CTE_PROCESS','RBAC_DENIED');
 await deniedByLedger('receive without handover on ledger','processor','CTE_RECEIVE_PROCESSOR','FSM_INVALID');
 await deny('receive without handover',`/lots/${lot.lotId}/handover/confirm`,tokens.processor,{eventType:'CTE_RECEIVE_PROCESSOR',location:'QA',previousEventId:lot.lastEventId},409);
 await record('farm','CTE_HARVEST',{quantity:100,unit:'kg'});
 const sender=lot.currentHolderOrganizationId;await record('farm','CTE_HANDOVER_PROCESSOR',{},'processor');assert.equal(lot.currentHolderOrganizationId,sender);
 await record('processor','CTE_RECEIVE_PROCESSOR');assert.equal(lot.currentHolderOrganizationId,companies.processor);
 await deny('quality cannot be bypassed',`/lots/${lot.lotId}/events`,tokens.processor,{eventType:'CTE_PROCESS',location:'QA',previousEventId:lot.lastEventId,data:{quantity:95,unit:'kg',qualityResult:'FAIL'}},400);
 await record('processor','CTE_PROCESS',{quantity:95,unit:'kg',qualityResult:'PASS'});
 await record('processor','CTE_HANDOVER_SHIP',{},'driver');
 await deniedByLedger('other business in same MSP cannot receive','otherDriver','CTE_RECEIVE_SHIP','WRONG_RECEIVER');
 assert.equal((await call(`/lots/${lot.lotId}`,tokens.otherDriver)).status,403);
 await deny('system cannot confirm',`/lots/${lot.lotId}/handover/confirm`,system,{eventType:'CTE_RECEIVE_SHIP',location:'QA',previousEventId:lot.lastEventId},403);
 await record('driver','CTE_RECEIVE_SHIP');assert.equal(lot.currentHolderOrganizationId,companies.driver);
 const previous=lot.lastEventId;await record('driver','CTE_TRANSPORT',{temperature:8.2,humidity:72});
 await deny('replayed transport event',`/lots/${lot.lotId}/events`,tokens.driver,{eventType:'CTE_TRANSPORT',location:'QA',previousEventId:previous,data:{temperature:8.2,humidity:72}},409);
 await record('driver','CTE_HANDOVER_RETAIL',{},'distributor');await record('distributor','CTE_DISPATCH_RETAIL',{quantity:95,unit:'kg'});await record('distributor','CTE_DISPLAY_SALE',{qualityResult:'PASS'});
 assert.equal(lot.status,'READY_FOR_SALE');assert.equal(lot.events.length,11);assert.equal(lot.ownerOrganizationId,companies.farm);assert.equal(lot.currentHolderOrganizationId,companies.distributor);
 const history=await fabric.history(lot.lotId);assert.deepEqual(history,lot.events);assert.equal(new Set(history.map(event=>event.eventId)).size,11);
 const verification=await call(`/lots/${lot.lotId}/validate`,system);assert.equal(verification.body.valid,true);assert.equal(verification.body.scope,'IESH_V4');
 const publicTrace=await call(`/public/trace/${lot.lotId}`);assert.equal(publicTrace.status,200);assert.equal(publicTrace.body.integrity.valid,true);assert.equal(publicTrace.body.events.length,11);assert.ok(!JSON.stringify(publicTrace.body).includes('signerId'));
 const qr=await fetch(`${base}/lots/${lot.lotId}/qr`);assert.equal(qr.status,200);assert.equal(qr.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await qr.arrayBuffer()).subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
 const committed=(await call('/admin/transactions?size=100',system)).body.items.filter(item=>item.lotId===lot.lotId);assert.equal(committed.length,11);assert.ok(committed.every(item=>item.status==='COMMITTED_VALID'));
 assert.ok(committed.every(item=>item.validationCode===0));
 await assert.rejects(fabric.commitStatus('not-a-transaction'),{statusCode:400});
 evidence.lotId=lot.lotId;evidence.finalStatus=lot.status;evidence.checks.fullWorkflow=true;evidence.checks.publicQr=true;evidence.checks.ledgerHistory=true;evidence.checks.allCommitsValid=true;
});
test('delivery: SQL tampering is detected; a hash-intact invalid history fails business replay',{skip:!enabled},async()=>{
 assert.ok(lot);const history=await fabric.history(lot.lotId);const original=history[0].dataHash;
 try{await db.execute('UPDATE trace_events SET data_hash=? WHERE event_id=?',['f'.repeat(64),history[0].eventId]);const result=await call(`/lots/${lot.lotId}/validate`,system);assert.equal(result.body.valid,false);assert.ok(result.body.anomalies.some(item=>item.code.startsWith('MYSQL_')));evidence.checks.sqlTamperingDetected=true;}
 finally{await db.execute('UPDATE trace_events SET data_hash=? WHERE event_id=?',[original,history[0].eventId]);}
 assert.equal((await call(`/lots/${lot.lotId}/validate`,system)).body.valid,true);
 const [[scope]]=await db.execute('SELECT current_holder_organization_id FROM lot_business_scopes WHERE lot_id=?',[lot.lotId]);
 const [[projection]]=await db.execute('SELECT projection_json FROM fabric_projections WHERE lot_id=?',[lot.lotId]);
 try {
  await db.execute('UPDATE lot_business_scopes SET current_holder_organization_id=? WHERE lot_id=?',[companies.farm,lot.lotId]);
  await db.execute("UPDATE fabric_projections SET projection_json=JSON_SET(projection_json,'$.owner','tampered') WHERE lot_id=?",[lot.lotId]);
  const result=await call(`/lots/${lot.lotId}/validate`,system);
  assert.equal(result.body.valid,false);
  assert.ok(result.body.anomalies.some(item=>item.code==='MYSQL_SCOPE'));
  assert.ok(result.body.anomalies.some(item=>item.code==='MYSQL_PROJECTION'));
 } finally {
  await db.execute('UPDATE lot_business_scopes SET current_holder_organization_id=? WHERE lot_id=?',[scope.current_holder_organization_id,lot.lotId]);
  await db.execute('UPDATE fabric_projections SET projection_json=? WHERE lot_id=?',[JSON.stringify(projection.projection_json),lot.lotId]);
 }
 assert.equal((await call(`/lots/${lot.lotId}/validate`,system)).body.valid,true);
 const altered=structuredClone(history);altered[8].eventType='CTE_DISPLAY_SALE';altered[8].data={qualityResult:'PASS'};
 for(const event of altered){event.dataHash=event.data.documentHash || workflow.hash(event.data);event.integrityHash=workflow.hash({...event,integrityHash:''});}
 assert.equal(workflow.baseline(altered).valid,true);const iesh=workflow.verify(lot,altered);assert.equal(iesh.valid,false);evidence.checks.hashIntactBusinessInvalidDetected=true;evidence.businessReplayAnomalies=iesh.anomalies.map(item=>({step:item.step,code:item.code}));
});
test('delivery: close and reopen SQL/Gateway connections retains state without another submit',{skip:!enabled},async()=>{
 const before=await fabric.history(lot.lotId);await storage.close();await fabric.close();require('./domain').reset();await storage.connect();
 const restored=await storage.getLot(lot.lotId);assert.equal(restored.lastEventId,lot.lastEventId);assert.equal(restored.status,'READY_FOR_SALE');assert.deepEqual(await fabric.history(lot.lotId),before);evidence.checks.reconnectPersistence=true;
 fs.writeFileSync(path.join(root,'reports/delivery-e2e.json'),JSON.stringify(evidence,null,2)+'\n');
});
test('delivery: demo seeding requests only missing signers and preserves disabled requests on retry',{skip:!enabled,timeout:60000},async()=>{
 const run=()=>promisify(execFile)(process.execPath,['backend/seed-demo.js','--accounts'],{cwd:root,env:{...process.env,API_URL:base,DEMO_PASSWORD:password}});
 await run();const pending=await storage.listIdentityRequests();assert.equal(pending.filter(item=>item.username.startsWith('demo-') && item.status==='PENDING').length,6);
 await storage.manageIdentity('demo-farmer',(await storage.listUsers('test-admin'))[0],'disable');
 const [[counts]]=await db.query('SELECT (SELECT COUNT(*) FROM user_accounts) AS users,(SELECT COUNT(*) FROM business_organizations) AS businesses');await run();
 const [[after]]=await db.query('SELECT (SELECT COUNT(*) FROM user_accounts) AS users,(SELECT COUNT(*) FROM business_organizations) AS businesses');assert.deepEqual(after,counts);assert.equal((await storage.listIdentityRequests()).find(item=>item.username==='demo-farmer').status,'DISABLED');
 evidence.checks.seedRetryPreservesAccountsAndDisabledSigners=true;fs.writeFileSync(path.join(root,'reports/delivery-e2e.json'),JSON.stringify(evidence,null,2)+'\n');
});
