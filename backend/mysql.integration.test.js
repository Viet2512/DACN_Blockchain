const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const {spawnSync} = require('node:child_process');
const storage = require('./storage');
const domain = require('./domain');
const {eventHash} = require('./hash');
const enabled = /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE === process.env.MYSQL_TEST_DATABASE;
let server, base, db;
const uploads = [];
const password = process.env.ADMIN_PASSWORD;
const users = {};
const businesses = {};
const orgs = {FARMER: 'Org1MSP', PROCESSOR: 'Org1MSP', TRANSPORTER: 'Org2MSP', DISTRIBUTOR: 'Org3MSP'};
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FABRIC_ENABLED, 'false');
  await storage.connect();
  db = await mysql.createConnection({host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, timezone: 'Z'});
  for (const [role, mspId] of Object.entries(orgs)) {
    const actorId = role.toLowerCase();
    await storage.saveActor({actorId, mspId, fabricIdentity: `test::${actorId}`, fullName: `Kiểm thử ${role} 🌱`, actorType: role, regionCode: 'TEST', roles: [role]});
    await storage.saveUser({username: actorId, password, role, actorId, orgMsp: mspId});
    businesses[role] = (await storage.listUsers(actorId))[0].organizationId;
  }
  server = require('./server').listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {server.once('listening', resolve); server.once('error', reject);});
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const username of ['test-admin', 'farmer', 'processor', 'transporter', 'distributor']) {
    const response = await call('/auth/login', null, 'POST', {username, password});
    assert.equal(response.status, 200); users[username] = response.body.token;
  }
});
after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await storage.close(); if (db) await db.end();
  for (const file of uploads) if (fs.existsSync(file)) fs.unlinkSync(file);
});
async function call(endpoint, token, method = 'GET', data) {
  const form = data instanceof FormData;
  const response = await fetch(base + endpoint, {method, headers: {...(!form ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})}, ...(data ? {body: form ? data : JSON.stringify(data)} : {})});
  return {status: response.status, body: response.status === 204 ? null : await response.json()};
}

test('real MySQL 8: API lifecycle, UTC/hash persistence, documents, QR, RBAC and restart', {skip: !enabled}, async () => {
  const admin = users['test-admin'];
  assert.equal((await call('/auth/me', admin)).body.role, 'SUPER_ADMIN');
  assert.equal((await call('/users', admin)).body.length, 5);
  assert.equal((await call('/actors', admin)).body.length, 4);
  assert.equal((await call('/organizations', admin)).body.length, 3);
  assert.equal((await call('/users', users.farmer)).status, 403);
  let response = await call('/lots', users.farmer, 'POST', {lotId: 'MYSQL-ISOLATED', productName: 'Xoài 🌱', origin: 'Tiền Giang', harvestDate: '2026-11-05', location: 'Vùng trồng TEST', regionCode: 'TEST', processorOrganizationId: businesses.PROCESSOR,distributorOrganizationId: businesses.DISTRIBUTOR});
  assert.equal(response.status, 201, JSON.stringify(response.body));
  let lot = response.body;
  const first = await storage.getLot(lot.lotId);
  assert.equal(first.harvestDate, '2026-11-05');
  assert.equal(first.events[0].integrityHash, eventHash(first.events[0]));
  assert.equal(first.events[0].timestamp, lot.events[0].timestamp);
  const form = new FormData(); const content = `%PDF-1.4\n${randomUUID()}\n%%EOF`;
  form.append('lotId', lot.lotId); form.append('document', new Blob([content], {type: 'application/pdf'}), 'test-document.pdf');
  const document = await call('/documents', users.farmer, 'POST', form);
  assert.equal(document.status, 201);
  uploads.push(path.join(__dirname, 'uploads', path.basename(document.body.path)));
  const steps = [
    ['farmer', 'CTE_HARVEST', '/events', {documentHash: document.body.fileHash,quantity:10,unit:'kg'}],
    ['farmer','CTE_HANDOVER_PROCESSOR','/handover/request',{toOrganizationId:businesses.PROCESSOR,toRegion:'TEST'}],
    ['processor','CTE_RECEIVE_PROCESSOR','/handover/confirm',{}],
    ['processor', 'CTE_PROCESS', '/events', {quantity:9,unit:'kg',qualityResult:'PASS'}],
    ['processor', 'CTE_HANDOVER_SHIP', '/handover/request', {toOrg: 'Org2MSP', toRegion: 'TEST',toOrganizationId: businesses.TRANSPORTER}],
    ['transporter', 'CTE_RECEIVE_SHIP', '/handover/confirm', {}],
    ['transporter','CTE_HANDOVER_RETAIL','/handover/request',{toOrganizationId:businesses.DISTRIBUTOR,toRegion:'TEST'}],
    ['distributor', 'CTE_DISPATCH_RETAIL', '/events', {quantity:9,unit:'kg'}],
    ['distributor', 'CTE_DISPLAY_SALE', '/events', {qualityResult:'PASS'}],
  ];
  for (const [username, eventType, suffix, data] of steps) {
    domain.reset();
    response = await call(`/lots/${lot.lotId}${suffix}`, users[username], 'POST', {eventType, previousEventId: lot.lastEventId, location: 'Kho TEST', data, ...data});
    assert.equal(response.status, 201, JSON.stringify(response.body)); lot = response.body;
    const persisted = (await call(`/lots/${lot.lotId}`, admin)).body;
    assert.equal(persisted.status, lot.status);
    assert.equal(persisted.lastEventId, lot.lastEventId);
    assert.equal(persisted.events.at(-1).integrityHash, eventHash(persisted.events.at(-1)));
  }
  assert.equal(lot.status, 'READY_FOR_SALE');
  assert.equal((await call(`/lots/${lot.lotId}/history`, admin)).body.length, 10);
  assert.equal((await call(`/lots/${lot.lotId}/validate`, admin)).body.valid, true);
  const docs = (await call(`/lots/${lot.lotId}/verify-documents`, admin)).body;
  assert.equal(docs.valid, true);
  const download = await fetch(`${base}/lots/${lot.lotId}/documents/${docs.documents[0].documentId}`, {headers: {Authorization: `Bearer ${admin}`}});
  assert.equal(download.status, 200); assert.equal(await download.text(), content);
  const qr = await fetch(`${base}/lots/${lot.lotId}/qr`); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
  const publicLot = (await call(`/public/trace/${lot.lotId}`)).body;
  assert.equal(publicLot.source, 'LOCAL'); assert.equal(publicLot.integrity.valid, true); assert.equal('actorId' in publicLot.events[0], false);
  const [beforeRows] = await db.query('SELECT event_id,data_hash,integrity_hash FROM trace_events ORDER BY event_id');
  await storage.close(); await storage.connect();
  const [afterRows] = await db.query('SELECT event_id,data_hash,integrity_hash FROM trace_events ORDER BY event_id');
  assert.deepEqual(afterRows, beforeRows);
  assert.equal((await call(`/lots/${lot.lotId}/recall`, users.distributor, 'POST', {location: 'TEST', previousEventId: lot.lastEventId, data: {note: 'Thu hồi trong DB kiểm thử'}})).status, 201);
  assert.equal((await call('/admin/audit-log', admin)).status, 200);
});

test('real MySQL: InnoDB/utf8mb4, foreign keys, SQL parameters and rollback', {skip: !enabled}, async () => {
  const [tables] = await db.query('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [process.env.MYSQL_DATABASE]);
  assert.equal(tables.length, 24); assert.ok(tables.every(t => t.ENGINE === 'InnoDB' && t.TABLE_COLLATION.startsWith('utf8mb4')));
  await assert.rejects(db.execute("INSERT INTO actor_roles (actor_id,role_code) VALUES (?,?)", ['missing-actor', 'FARMER']), {code: 'ER_NO_REFERENCED_ROW_2'});
  assert.equal((await storage.listUsers("' OR 1=1 --")).length, 0);
  const original = (await storage.listActors()).find(a => a.actorId === 'farmer');
  await assert.rejects(storage.saveActor({...original, fullName: 'Must roll back', roles: ['FARMER', 'FARMER']}), {code: 'ER_DUP_ENTRY'});
  assert.deepEqual((await storage.listActors()).find(a => a.actorId === 'farmer'), original);
  const invalid = domain.createLot({lotId: 'MYSQL-ROLLBACK', productName: 'Test', origin: 'TEST', harvestDate: '2026-11-05', location: 'TEST', organizationId:businesses.FARMER,actorId: 'farmer', actorRole: 'FARMER', regionCode: 'TEST', processorOrganizationId: businesses.PROCESSOR,distributorOrganizationId: businesses.DISTRIBUTOR});
  invalid.events[0].actorId = null;
  await assert.rejects(storage.saveLot(invalid), {code: 'ER_BAD_NULL_ERROR'});
  assert.equal(await storage.getLot(invalid.lotId), null);
  const saved = await storage.getLot('MYSQL-ISOLATED');
  const changed = structuredClone(saved);
  changed.events[0].dataHash = 'f'.repeat(64);
  await assert.rejects(storage.saveLot(changed), /cannot be overwritten/);
  assert.deepEqual(await storage.getLot(saved.lotId), saved);
});

test('real MySQL: concurrent writers reject stale lastEventId and SQL failure rolls back RAM/API', {skip: !enabled}, async () => {
  const response = await call('/lots', users.farmer, 'POST', {lotId: 'MYSQL-CONCURRENT', productName: 'QA', origin: 'QA', harvestDate: '2026-11-06', location: 'QA', regionCode: 'TEST', processorOrganizationId: businesses.PROCESSOR,distributorOrganizationId: businesses.DISTRIBUTOR});
  assert.equal(response.status, 201);
  let lot = response.body;
  const payload = {organizationId:businesses.FARMER,data:{quantity:10,unit:'kg'},eventType: 'CTE_HARVEST', actorId: 'farmer', actorRole: 'FARMER', location: 'QA', previousEventId: lot.lastEventId};
  const drafts = [domain.recordEvent(lot.lotId, payload, lot), domain.recordEvent(lot.lotId, payload, lot)];
  const results = await Promise.allSettled(drafts.map(draft => storage.saveLot(draft, lot.lastEventId)));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.find(item => item.status === 'rejected').reason.statusCode, 409);
  lot = await storage.getLot(lot.lotId);
  assert.equal(lot.events.length, 2);
  const save = storage.saveLot;
  storage.saveLot = async (candidate, ...args) => {candidate.events.at(-1).actorId = null; return save(candidate, ...args);};
  try {assert.equal((await call(`/lots/${lot.lotId}/events`, users.farmer, 'POST', {eventType: 'CTE_HANDOVER_PROCESSOR', location:'QA',previousEventId:lot.lastEventId,toOrganizationId:businesses.PROCESSOR,toRegion:'TEST'})).status, 500);}
  finally {storage.saveLot = save;}
  assert.equal((await storage.getLot(lot.lotId)).status, 'HARVESTED');
  assert.equal((await call(`/lots/${lot.lotId}/events`, users.farmer, 'POST', {eventType: 'CTE_HANDOVER_PROCESSOR', location:'QA',previousEventId:lot.lastEventId,toOrganizationId:businesses.PROCESSOR,toRegion:'TEST'})).status, 201);
});

test('real MySQL: business logs, role revocation, malformed files and change password', {skip: !enabled}, async () => {
  const id = 'MYSQL-CONCURRENT';
  const log = {occurredAt: '2026-11-06T00:00:00Z', activity: 'Tưới nước', note: 'Off-chain QA'};
  assert.equal((await call(`/lots/${id}/cultivation-logs`, users.farmer, 'POST', log)).status, 201);
  assert.equal((await call(`/lots/${id}/cultivation-logs`, users.processor, 'POST', log)).status, 403);
  assert.equal((await call(`/lots/${id}/cultivation-logs`, users.farmer)).body.total, 1);
  assert.equal((await call(`/lots/${id}/cultivation-logs?page=0`, users.farmer)).status, 400);
  assert.equal((await call(`/lots/${id}/quality-checks`, users.processor, 'POST', {occurredAt: log.occurredAt, result: 'PASS'})).status, 201);
  assert.equal((await call(`/lots/${id}/incidents`, users.processor, 'POST', {occurredAt: log.occurredAt, type: 'QA', description: 'Sự cố thử nghiệm'})).status, 201);
  const form = new FormData(); form.append('lotId', id); form.append('document', new Blob(['fake PDF'], {type: 'application/pdf'}), 'fake.pdf');
  assert.equal((await call('/documents', users.farmer, 'POST', form)).status, 400);
  const [{fileHash}] = await storage.listDocuments('MYSQL-ISOLATED');
  const current = await storage.getLot(id);
  assert.equal((await call(`/lots/${id}/handover/confirm`, users.processor, 'POST', {location:'QA',previousEventId:current.lastEventId,data:{documentHash:fileHash}})).status, 400);
  for (const entity of ['actors', 'organizations']) {
    if (entity === 'actors') await db.execute("UPDATE actors SET status='INACTIVE' WHERE actor_id='farmer'");
    else await db.execute("UPDATE organizations SET status='INACTIVE' WHERE msp_id='Org1MSP'");
    assert.equal((await call('/auth/me', users.farmer)).status, 401);
    assert.equal((await call('/auth/login', null, 'POST', {username: 'farmer', password})).status, 401);
    if (entity === 'actors') await db.execute("UPDATE actors SET status='ACTIVE' WHERE actor_id='farmer'");
    else await db.execute("UPDATE organizations SET status='ACTIVE' WHERE msp_id='Org1MSP'");
    users.farmer = (await call('/auth/login', null, 'POST', {username: 'farmer', password})).body.token;
  }
  await db.execute('DELETE FROM actor_roles WHERE actor_id=? AND role_code=?', ['farmer', 'FARMER']);
  assert.equal((await call('/auth/me', users.farmer)).status, 401);
  assert.equal((await call('/auth/login', null, 'POST', {username: 'farmer', password})).status, 401);
  await db.execute('INSERT INTO actor_roles (actor_id,role_code) VALUES (?,?)', ['farmer', 'FARMER']);
  const login = await call('/auth/login', null, 'POST', {username: 'farmer', password}); users.farmer = login.body.token;
  assert.equal((await call('/auth/change-password', users.farmer, 'POST', {currentPassword: 'wrong', newPassword: 'new-qa-password'})).status, 403);
  assert.equal((await call('/auth/change-password', users.farmer, 'POST', {currentPassword: password, newPassword: 'new-qa-password'})).status, 204);
  assert.equal((await call('/auth/me', users.farmer)).status, 401);
  assert.equal((await call('/auth/login', null, 'POST', {username: 'farmer', password: 'new-qa-password'})).status, 200);
});

test('actor compatibility: shared legacy IDs survive user updates, contacts are per-user and migration is repeatable', {skip: !enabled}, async () => {
  const actor = {actorId:'legacy-shared',mspId:'Org1MSP',fabricIdentity:'test::legacy-shared',fullName:'Legacy farmer',phone:'0901111111',actorType:'FARMER',regionCode:'TEST',roles:['FARMER']};
  await storage.saveActor(actor);
  for (const username of ['legacy-a','legacy-b']) await storage.saveUser({username,password,role:'FARMER',actorId:actor.actorId,orgMsp:actor.mspId});
  const first = (await storage.listUsers('legacy-a'))[0];
  const second = (await storage.listUsers('legacy-b'))[0];
  assert.notEqual(first.userId,second.userId);
  assert.deepEqual(first.legacyActorIds,[actor.actorId]);
  assert.deepEqual(second.legacyActorIds,[actor.actorId]);
  assert.equal(first.phone,actor.phone);
  const oldLot = domain.createLot({lotId:'LEGACY-ACTOR-PRESERVED',productName:'Legacy',origin:'TEST',harvestDate:'2026-11-06',location:'TEST',organizationId:first.organizationId,processorOrganizationId:businesses.PROCESSOR,distributorOrganizationId:businesses.DISTRIBUTOR,actorId:actor.actorId,actorRole:'FARMER',regionCode:'TEST'},false);
  await storage.saveLot(oldLot);
  const snapshot = await storage.getLot(oldLot.lotId);
  const response = await call('/users/legacy-a',users['test-admin'],'PATCH',{
    username:first.username,role:'FARMER',organizationId:first.organizationId,regionCode:'TEST',fullName:'Updated user',phone:'0902222222',
    userId:second.userId,actorId:second.actorId,
  });
  assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.body.userId,first.userId);
  assert.equal(response.body.actorId,first.userId);
  assert.deepEqual(response.body.legacyActorIds,[actor.actorId]);
  assert.equal(response.body.phone,'0902222222');
  assert.equal((await storage.listUsers('legacy-b'))[0].phone,actor.phone);
  assert.equal((await storage.listActors()).find(row=>row.actorId===actor.actorId).fullName,actor.fullName);
  assert.deepEqual(await storage.getLot(oldLot.lotId),snapshot);
  assert.equal((await call('/lots/LEGACY-ACTOR-PRESERVED/history',users['test-admin'])).body[0].actorId,actor.actorId);
  const before = (await storage.listUsers()).map(user=>({userId:user.userId,phone:user.phone,legacyActorIds:user.legacyActorIds}));
  for (let run=0;run<2;run++) {
    const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/migrate-actors.js')],{env:process.env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  }
  assert.deepEqual((await storage.listUsers()).map(user=>({userId:user.userId,phone:user.phone,legacyActorIds:user.legacyActorIds})),before);
  assert.deepEqual(await storage.getLot(oldLot.lotId),snapshot);
  const invalid = await call('/users/legacy-a',users['test-admin'],'PATCH',{username:first.username,role:'FARMER',organizationId:first.organizationId,regionCode:'TEST',phone:'x'.repeat(41)});
  assert.equal(invalid.status,400);
});

test('migration 005 upgrades the previous schema without changing actors or history', {skip: !enabled}, async () => {
  const snapshots = {};
  for (const table of ['actors','actor_roles','trace_events','lots','fabric_identities']) {
    const [rows]=await db.query(`SELECT * FROM ${table}`);
    snapshots[table]=rows;
  }
  // Recreate the pre-005 shape only inside the disposable test database.
  await db.query('DROP TABLE user_actor_mappings');
  await db.query('ALTER TABLE application_user_profiles DROP COLUMN phone');
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/migrate-actors.js')],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal((await storage.listUsers('legacy-b'))[0].phone,'0901111111');
  assert.deepEqual((await storage.listUsers('legacy-b'))[0].legacyActorIds,['legacy-shared']);
  for (const table of Object.keys(snapshots)) {
    const [rows]=await db.query(`SELECT * FROM ${table}`);
    assert.deepEqual(rows,snapshots[table],`${table} must remain unchanged`);
  }
});

test('recovery links documents on every missed event, including a non-latest event', {skip:!enabled},async()=>{
 const farmer=(await storage.listUsers('farmer'))[0];const token=require('./auth').createSession(farmer);
 const result=await call('/lots',token,'POST',{lotId:'MYSQL-DOC-REPLAY',productName:'QA',origin:'TG',harvestDate:'2026-11-06',location:'QA',regionCode:'TEST',processorOrganizationId:businesses.PROCESSOR,distributorOrganizationId:businesses.DISTRIBUTOR});
 assert.equal(result.status,201);const initial=result.body;
 const form=new FormData();form.append('lotId',initial.lotId);form.append('document',new Blob(['%PDF-1.4\n'+randomUUID()+'\n%%EOF'],{type:'application/pdf'}),'recovery.pdf');
 const uploaded=await call('/documents',token,'POST',form);assert.equal(uploaded.status,201);uploads.push(path.join(__dirname,'uploads',path.basename(uploaded.body.path)));
 const identity={actorId:farmer.userId,userId:farmer.userId,organizationId:farmer.organizationId,actorRole:'FARMER',orgMsp:'Org1MSP',actorRegion:'TEST',location:'QA'};
 const harvested=domain.recordEvent(initial.lotId,{...identity,eventType:'CTE_HARVEST',previousEventId:initial.lastEventId,data:{quantity:10,unit:'kg',documentHash:uploaded.body.fileHash}},initial);
 const pending=domain.recordEvent(initial.lotId,{...identity,eventType:'CTE_HANDOVER_PROCESSOR',previousEventId:harvested.lastEventId,data:{toOrganizationId:businesses.PROCESSOR,toOrg:'Org1MSP',toRegion:'TEST'}},harvested);
 await storage.saveLot(pending,initial.lastEventId);
 const documents=await storage.listDocuments(initial.lotId);assert.equal(documents[0].eventId,harvested.lastEventId);assert.equal(pending.events.at(-1).data.documentHash,undefined);
});

test('an authorized farmer without a signing certificate gets an identity-specific error', {skip:!enabled},async()=>{
 const farmer=(await storage.listUsers('farmer'))[0];
 assert.equal(farmer.authorized,1);assert.ok(farmer.permissions.includes('LOT_CREATE'));
 await assert.rejects(storage.getSigningIdentity(farmer),{statusCode:403,step:'Identity',code:'FABRIC_IDENTITY_REQUIRED'});
});
