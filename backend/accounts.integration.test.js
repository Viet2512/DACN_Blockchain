const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const mysql=require('mysql2/promise');
const storage=require('./storage');
const fabric=require('./fabric');
const enabled=process.env.ACCOUNT_INTEGRATION==='true' && /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE===process.env.MYSQL_TEST_DATABASE;
const onChain=process.env.FABRIC_ENABLED==='true';
let server,base,db,system,bossA,bossB,staff,staffUser;
const organizations={},invitations={};
const password=randomBytes(24).toString('hex');
async function call(endpoint,token,method='GET',body){const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:response.status===204?null:await response.json()};}
async function login(username,pw=password){const result=await call('/auth/login',null,'POST',{username,password:pw});assert.equal(result.status,200,JSON.stringify(result.body));return result.body.token;}
async function invite(actor,username,role,organizationId){const result=await call('/users/invitations',actor,'POST',{username,role,organizationId,fullName:'Người dùng kiểm thử',email:`${username}@example.invalid`,regionCode:'QA'});assert.equal(result.status,201,JSON.stringify(result.body));assert.match(result.body.activationToken,/^[a-f0-9]{64}$/);invitations[username]=result.body.activationToken;return result.body.activationToken;}
async function activate(username){assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invitations[username],password})).status,204);return login(username);}
before(async()=>{
 if(!enabled)return;
 await storage.connect();
 db=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
 server=require('./server').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api`;
 system=await login('test-admin',process.env.ADMIN_PASSWORD);
});
after(async()=>{if(!enabled)return;if(server)await new Promise(resolve=>server.close(resolve));await storage.close();if(db)await db.end();await fabric.close();});
test('system creates businesses, invites business admins; pending login, activation replay and hashed storage',{skip:!enabled},async()=>{
 for(const name of ['A','B']){const result=await call('/business-organizations',system,'POST',{code:`ACCOUNT-${name}`,name:`Doanh nghiệp ${name}`,type:'FARM',mspId:'Org1MSP'});assert.equal(result.status,201);organizations[name]=result.body.organizationId;await invite(system,`boss${name}`,'BUSINESS_ADMIN',organizations[name]);}
 assert.equal((await call('/auth/login',null,'POST',{username:'bossA',password})).status,401);
 assert.equal((await call('/users/bossA/status',system,'PATCH',{status:'ACTIVE'})).status,409);
 assert.equal((await call('/users/bossA/status',system,'PATCH',{status:'INACTIVE'})).status,200);
 assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invitations.bossA,password})).status,400);
 const reopened=await call('/users/bossA/status',system,'PATCH',{status:'ACTIVE'});assert.equal(reopened.status,200);assert.equal(reopened.body.status,'PENDING_ACTIVATION');
 bossA=await activate('bossA');bossB=await activate('bossB');
 assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invitations.bossA,password})).status,400);
 const [[row]]=await db.query("SELECT i.token_hash,u.password_hash FROM account_invitations i JOIN application_user_profiles p ON p.user_id=i.user_id JOIN user_accounts u ON u.username=p.username WHERE p.username='bossA'");
 assert.notEqual(row.token_hash,invitations.bossA);assert.notEqual(row.password_hash,password);
 const me=(await call('/auth/me',bossA)).body;assert.equal(me.role,'BUSINESS_ADMIN');assert.equal(me.organizationId,organizations.A);assert.ok(!me.permissions.includes('LOT_CREATE'));
});
test('tenant staff invitation, privilege escalation, IDOR and old API paths',{skip:!enabled},async()=>{
 assert.equal((await call('/users')).status,401);
 assert.equal((await call('/users/invitations',bossA,'POST',{username:'attack',role:'SUPER_ADMIN'})).status,403);
 assert.equal((await call('/users/invitations',bossA,'POST',{username:'attack',role:'FARMER',organizationId:organizations.B})).status,403);
 await invite(bossA,'staffA','FARMER');await invite(bossB,'staffB','FARMER');staff=await activate('staffA');await activate('staffB');
 staffUser=(await call('/auth/me',staff)).body;assert.equal(staffUser.organizationId,organizations.A);
 assert.equal((await call('/users',bossA)).body.some(user=>user.username==='staffB'),false);
 assert.equal((await call('/users/staffB/status',bossA,'PATCH',{status:'INACTIVE'})).status,404);
 assert.equal((await call('/users/staffB',bossA,'PATCH',{role:'FARMER',organizationId:organizations.A,regionCode:'QA'})).status,403);
 assert.equal((await call('/users/staffA',bossA,'PATCH',{role:'SUPER_ADMIN'})).status,403);
 assert.equal((await call('/users/staffA',bossA,'PATCH',{role:'FARMER',organizationId:organizations.B,regionCode:'QA'})).status,403);
 assert.equal((await call('/users/bossB/reset-password',bossA,'POST',{password})).status,403);
 assert.equal((await call('/users',staff)).status,403);
 assert.equal((await call('/users/invitations',staff,'POST',{username:'attack',role:'BUSINESS_ADMIN'})).status,403);
 assert.equal((await call('/users/staffA',staff,'PATCH',{role:'SUPER_ADMIN'})).status,403);
 assert.equal((await call('/actors',bossA)).status,403);
 const old=staff;assert.equal((await call('/users/staffA/status',bossA,'PATCH',{status:'INACTIVE'})).status,200);
 assert.equal((await call('/auth/me',old)).status,401);assert.equal((await call('/auth/login',null,'POST',{username:'staffA',password})).status,401);
 assert.equal((await call('/users/staffA/status',bossA,'PATCH',{status:'ACTIVE'})).status,200);staff=await login('staffA');
 assert.equal((await call('/users/staffA',bossA,'PATCH',{role:'FARMER',fullName:'Tên mới',email:'staffA@example.invalid',regionCode:'QA'})).status,200);
 assert.equal((await call('/auth/me',staff)).status,401);staff=await login('staffA');
 const oldSession=staff;assert.equal((await call('/users/STAFFA/reset-password',system,'POST',{password})).status,200);assert.equal((await call('/auth/me',oldSession)).status,401);staff=await login('staffA');
 await db.query("DELETE FROM role_permissions WHERE role_code='BUSINESS_ADMIN' AND permission_code='USER_CREATE'");
 try{assert.equal((await call('/users/invitations',bossA,'POST',{})).status,403);}finally{await db.query("INSERT INTO role_permissions VALUES ('BUSINESS_ADMIN','USER_CREATE')");}
});
test('expired and replaced invitations, production refuses token disclosure; audit has no secrets',{skip:!enabled},async()=>{
 await invite(bossA,'expired','FARMER');
 await db.query("UPDATE account_invitations i JOIN application_user_profiles p ON p.user_id=i.user_id SET i.expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE p.username='expired'");
 assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invitations.expired,password})).status,400);
 const resent=await call('/users/expired/invitation',bossA,'POST');assert.equal(resent.status,201);assert.notEqual(resent.body.activationToken,invitations.expired);
 assert.equal((await call('/auth/accept-invitation',null,'POST',{token:invitations.expired,password})).status,400);
 assert.equal((await call('/auth/accept-invitation',null,'POST',{token:resent.body.activationToken,password})).status,204);
 const original=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{const result=await call('/users/invitations',bossA,'POST',{username:'production-user',role:'FARMER',fullName:'Người dùng',email:'p@example.invalid'});assert.equal(result.status,503);assert.ok(!result.body.activationToken);}finally{process.env.NODE_ENV=original;}
 assert.equal((await storage.listUsers('production-user')).length,0);
 const audit=JSON.stringify((await call('/business/activity',bossA)).body);
 for(const secret of [password,...Object.values(invitations),'privateKeyReference','password_hash'])assert.equal(audit.includes(secret),false);
});
test('Fabric request scope, missing certificate, real per-user enrollment, commit and signing disable',{skip:!enabled,timeout:180000},async()=>{
 assert.equal((await call('/users/staffA/fabric-identity/request',bossA,'POST')).status,204);
 assert.equal((await call('/users/staffB/fabric-identity/request',bossA,'POST')).status,404);
 assert.equal((await call('/users/bossA/fabric-identity/request',bossA,'POST')).status,409);
 await assert.rejects(storage.getSigningIdentity(staffUser),{statusCode:403});
 assert.equal((await call('/fabric-identity-requests',bossB)).body.some(row=>row.username==='staffA'),false);
 if(!onChain)return;
 const issued=await call('/users/staffA/fabric-identity/issue',bossA,'POST');assert.equal(issued.status,202,JSON.stringify(issued.body));
 assert.equal((await call('/users/staffB/fabric-identity/issue',bossA,'POST')).status,404);
 assert.equal((await call('/users/staffA/fabric-identity/issue',staff,'POST')).status,403);
 const provisioned=await require('./fabric-enrollment').issueApproved('staffA');assert.equal(provisioned.status,'ACTIVE');
 const signing=await storage.getSigningIdentity(staffUser);assert.equal(signing.organizationId,organizations.A);
 await assert.rejects(storage.getSigningIdentity({...staffUser,organizationId:organizations.B}),{statusCode:403});
 const processor=await call('/business-organizations',system,'POST',{code:'ACCOUNT-PROCESSOR',name:'Sơ chế',type:'PROCESSING_FACILITY',mspId:'Org1MSP'});
 const distributor=await call('/business-organizations',system,'POST',{code:'ACCOUNT-DISTRIBUTOR',name:'Phân phối',type:'DISTRIBUTION_COMPANY',mspId:'Org3MSP'});
 const payload={lotId:`ACCOUNT-${randomBytes(8).toString('hex')}`,productName:'Xoài',origin:'QA',harvestDate:'2026-11-06',location:'QA',regionCode:'QA',processorOrganizationId:processor.body.organizationId,distributorOrganizationId:distributor.body.organizationId};
 assert.equal((await call('/lots',bossA,'POST',payload)).status,403);assert.equal((await call('/lots',system,'POST',payload)).status,403);
 const created=await call('/lots',staff,'POST',payload);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.source,'FABRIC');assert.match(created.body.lastEventId,/^[a-f0-9]{64}$/);
 assert.equal((await call(`/lots/${created.body.lotId}/validate`,staff)).body.valid,true);
 assert.equal((await call('/users/staffA/status',bossA,'PATCH',{status:'INACTIVE'})).status,200);
 await assert.rejects(storage.getSigningIdentity(staffUser),{statusCode:403});
 assert.equal((await call(`/lots/${created.body.lotId}/events`,staff,'POST',{})).status,401);
 assert.equal((await call('/users/staffA/status',bossA,'PATCH',{status:'ACTIVE'})).status,200);staff=await login('staffA');
 assert.equal((await call('/users/staffA/fabric-identity/disable',bossA,'POST')).status,204);
 await assert.rejects(storage.getSigningIdentity(staffUser),{statusCode:403});
 assert.equal((await call(`/lots/${created.body.lotId}/events`,staff,'POST',{eventType:'CTE_HARVEST',location:'QA',previousEventId:created.body.lastEventId,data:{quantity:10,unit:'kg'}})).status,403);
 assert.equal((await call(`/lots/${created.body.lotId}/history`,staff)).body.length,1);
 const committed=(await call('/admin/transactions',system)).body.items.find(item=>item.transactionId===created.body.lastEventId);assert.equal(committed.status,'COMMITTED_VALID');
 require('node:fs').writeFileSync(require('node:path').join(__dirname,'../reports/account-hierarchy-fabric.json'),JSON.stringify({verifiedAt:new Date().toISOString(),transactionId:committed.transactionId,lotId:created.body.lotId,source:'FABRIC',commitStatus:committed.status,historyValid:true,disabledAccountCannotSign:true,disabledIdentityCannotSign:true},null,2)+'\n');
});
test('migration is repeatable and retains accounts, invitation rows and event history',{skip:!enabled},async()=>{
 const [[before]]=await db.query('SELECT (SELECT COUNT(*) FROM user_accounts) AS users,(SELECT COUNT(*) FROM account_invitations) AS invitations,(SELECT COUNT(*) FROM trace_events) AS events');
 for(let i=0;i<2;i++){const result=spawnSync(process.execPath,['scripts/migrate-accounts.js'],{cwd:require('node:path').join(__dirname,'..'),env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 const [[after]]=await db.query('SELECT (SELECT COUNT(*) FROM user_accounts) AS users,(SELECT COUNT(*) FROM account_invitations) AS invitations,(SELECT COUNT(*) FROM trace_events) AS events');assert.deepEqual(after,before);
});

test('system recovers business administration with a replacement invitation and revokes the old admin session',{skip:!enabled},async()=>{
 assert.equal((await call('/users/bossB/status',system,'PATCH',{status:'INACTIVE'})).status,200);
 assert.equal((await call('/auth/me',bossB)).status,401);
 await invite(system,'replacementBossB','BUSINESS_ADMIN',organizations.B);
 const replacement=await activate('replacementBossB');
 const me=(await call('/auth/me',replacement)).body;assert.equal(me.organizationId,organizations.B);assert.equal(me.role,'BUSINESS_ADMIN');
 assert.equal((await call('/users',replacement)).body.some(user=>user.username==='staffB'),true);
 assert.equal((await call('/users',replacement)).body.some(user=>user.username==='staffA'),false);
 assert.equal((await call('/users/bossB/status',replacement,'PATCH',{status:'ACTIVE'})).status,404);
});
test('activation endpoint applies a rate limit to repeated invalid tokens',{skip:!enabled},async()=>{
 let result;for(let i=0;i<31;i++)result=await call('/auth/accept-invitation',null,'POST',{token:'invalid',password});assert.equal(result.status,429);
});
