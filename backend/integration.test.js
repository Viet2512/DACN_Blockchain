const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const storage = require("./storage");
const domain = require("./domain");
const auth = require("./auth");
const policy = require("./authorization");
const { verifyHistory, publicProjection } = require("./integrity");

process.env.NODE_ENV="test";
process.env.MYSQL_TEST_DATABASE="tracechain_test_000000000000";
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;
process.env.FABRIC_ENABLED = "false";
const lots = new Map();
const users = new Map();
const roles = ["ADMIN", "FARMER", "PROCESSOR", "TRANSPORTER", "DISTRIBUTOR"];
const orgs = {
  FARMER: "Org1MSP",
  PROCESSOR: "Org1MSP",
  TRANSPORTER: "Org2MSP",
  DISTRIBUTOR: "Org3MSP",
};
storage.listUsers = async (username) =>
  [...users.values()].filter((u) => !username || u.username === username);
storage.authenticateUser = async (name, password) =>
  password === "test-secret" && users.get(name)?.status === "ACTIVE"
    ? users.get(name)
    : null;
storage.getLot = async (id) => structuredClone(lots.get(id) || null);
storage.listLots = async () =>
  [...lots.values()].map(({ events, ...lot }) => ({
    ...lot,
    eventCount: events.length,
  }));
storage.saveLot = async (lot) => lots.set(lot.lotId, structuredClone(lot));
storage.listDocuments = async () => [];
storage.listBusinessOrganizations = async () => [];
storage.organizationForEvent = async (id,type) => ({id,mspId:type==='PROCESSING_FACILITY'?'Org1MSP':type==='DISTRIBUTION_COMPANY'?'Org3MSP':'Org2MSP'});
storage.setUserStatus = async (username, status) => {
  users.get(username).status = status;
};
storage.resetUserPassword = async (username) => {
  users.get(username).status = "ACTIVE";
};
storage.saveAudit = async () => {};
let server, base;
before(async () => {
  server = require("./server").listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  lots.clear();
  domain.reset();
  users.clear();
  for (const role of roles)
    users.set(role, {
      username: role,
      userId: `${role}-user`,
      organizationId: role === 'ADMIN' ? null : `${role}-org`,
      permissions: policy.permissions[policy.normalizeRole(role)],
      role,
      actorId: role.toLowerCase(),
      orgMsp: orgs[role] || null,
      regionCode: "TG-001",
      status: "ACTIVE",
    });
});
async function call(path, user, method = "GET", body) {
  const token = user ? auth.createSession(users.get(user) || user) : null;
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
  };
}
async function create() {
  const result = await call("/lots", "FARMER", "POST", {
    lotId: "LOT-TEST",
    productName: "Xoài",
    origin: "Tiền Giang",
    harvestDate: "2026-10-28",
    location: "Nông trại",
    regionCode: "TG-001",
    processorOrganizationId: "PROCESSOR-org",
    distributorOrganizationId: "DISTRIBUTOR-org",
  });
  assert.equal(result.status, 201);
  return result.body;
}
const record = (lot, role, eventType, data = {}, path = "/events") =>
  call(`/lots/${lot.lotId}${path}`, role, "POST", {
    eventType,
    location: "Điểm kiểm thử",
    previousEventId: lot.lastEventId,
    data: {...(["CTE_HARVEST","CTE_PROCESS","CTE_DISPATCH_RETAIL"].includes(eventType)?{quantity:10,unit:"kg"}:{}),...(["CTE_PROCESS","CTE_DISPLAY_SALE"].includes(eventType)?{qualityResult:"PASS"}:{}),...(eventType==="CTE_RECALL"?{note:"QA recall"}:{}),...data},
    ...data,
  });

test("authentication: correct/incorrect login, me, expired/locked sessions, admin guard", async () => {
  assert.equal(
    (
      await call("/auth/login", null, "POST", {
        username: "ADMIN",
        password: "bad",
      })
    ).status,
    401,
  );
  const login = await call("/auth/login", null, "POST", {
    username: "FARMER",
    password: "test-secret",
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, "FARMER");
  assert.equal((await call("/auth/me")).status, 401);
  assert.equal((await call("/users", "FARMER")).status, 403);
  const headers = { Authorization: `Bearer ${login.body.token}` };
  assert.equal((await fetch(base + "/auth/me", { headers })).status, 200);
  assert.equal(
    (
      await call("/users/FARMER/status", "ADMIN", "PATCH", {
        status: "INACTIVE",
      })
    ).status,
    200,
  );
  assert.equal((await fetch(base + "/auth/me", { headers })).status, 401);
  assert.equal(
    (
      await call("/auth/login", null, "POST", {
        username: "FARMER",
        password: "test-secret",
      })
    ).status,
    401,
  );
});

test("full local FSM survives restored storage, rejects wrong role/state/previous event, locks recall", async () => {
  let lot = await create();
  assert.equal(
    (await call("/lots", "FARMER", "POST", { ...lot, location: "x" })).status,
    409,
  );
  assert.equal((await record(lot, "FARMER", "CTE_PROCESS")).status, 403);
  assert.equal((await record(lot, "PROCESSOR", "CTE_PROCESS")).status, 409);
  assert.equal(
    (await record({ ...lot, lastEventId: "wrong" }, "FARMER", "CTE_HARVEST"))
      .status,
    409,
  );
  domain.reset();
  lot = (await record(lot, "FARMER", "CTE_HARVEST")).body;
  lot = (await record(lot,"FARMER","CTE_HANDOVER_PROCESSOR",{toOrganizationId:"PROCESSOR-org",toOrg:"Org1MSP",toRegion:"TG-001"},"/handover/request")).body;
  lot = (await record(lot,"PROCESSOR","CTE_RECEIVE_PROCESSOR",{},"/handover/confirm")).body;
  lot = (await record(lot, "PROCESSOR", "CTE_PROCESS")).body;
  lot = (
    await record(
      lot,
      "PROCESSOR",
      "CTE_HANDOVER_SHIP",
      { toOrg: "Org2MSP", toRegion: "TG-001", toOrganizationId: "TRANSPORTER-org" },
      "/handover/request",
    )
  ).body;
  assert.equal(lot.status, "WAITING_SHIP");
  assert.equal(
    (await call("/lots", "TRANSPORTER")).body[0].pendingTo,
    "Org2MSP",
  );
  lot = (
    await record(
      lot,
      "TRANSPORTER",
      "CTE_RECEIVE_SHIP",
      {},
      "/handover/confirm",
    )
  ).body;
  assert.equal(lot.status, "IN_TRANSIT");
  assert.equal(
    (
      await record(
        lot,
        "TRANSPORTER",
        "CTE_RECEIVE_SHIP",
        {},
        "/handover/confirm",
      )
    ).status,
    409,
  );
  lot = (await record(lot,"TRANSPORTER","CTE_HANDOVER_RETAIL",{toOrganizationId:"DISTRIBUTOR-org",toOrg:"Org3MSP",toRegion:"TG-001"},"/handover/request")).body;
  lot = (await record(lot, "DISTRIBUTOR", "CTE_DISPATCH_RETAIL")).body;
  lot = (await record(lot, "DISTRIBUTOR", "CTE_DISPLAY_SALE")).body;
  assert.equal(lot.status, "READY_FOR_SALE");
  assert.equal(
    (await record(lot, "ADMIN", "CTE_RECALL", {}, "/recall")).status,
    403,
  );
  lot = (
    await record(
      lot,
      "DISTRIBUTOR",
      "CTE_RECALL",
      { note: "Kiểm thử" },
      "/recall",
    )
  ).body;
  assert.equal(lot.status, "RECALLED");
  assert.equal(
    (await record(lot, "DISTRIBUTOR", "CTE_DISPLAY_SALE")).status,
    409,
  );
  const check = await call("/lots/LOT-TEST/validate", "ADMIN");
  assert.equal(check.body.valid, true);
  assert.equal(check.body.scope, "HASH_AND_PREVIOUS_EVENT");
});

test("scope: denies cross-region history/validation/documents and wrong receiver MSP/region", async () => {
  let lot = await create();
  const outsider = {
    username: "OUT",
    userId: "OUT-user",
    organizationId: "OUT-org",
    permissions: policy.permissions.TRANSPORTER,
    role: "TRANSPORTER",
    actorId: "other",
    orgMsp: "Org3MSP",
    regionCode: "OTHER",
    status: "ACTIVE",
  };
  users.set("OUT", outsider);
  for (const suffix of ["", "/history", "/validate", "/verify-documents"])
    assert.equal((await call(`/lots/LOT-TEST${suffix}`, "OUT")).status, 403);
  lot = (await record(lot, "FARMER", "CTE_HARVEST")).body;
  lot = (await record(lot,"FARMER","CTE_HANDOVER_PROCESSOR",{toOrganizationId:"PROCESSOR-org",toOrg:"Org1MSP",toRegion:"TG-001"},"/handover/request")).body;
  lot = (await record(lot,"PROCESSOR","CTE_RECEIVE_PROCESSOR",{},"/handover/confirm")).body;
  lot = (await record(lot, "PROCESSOR", "CTE_PROCESS")).body;
  lot = (
    await record(
      lot,
      "PROCESSOR",
      "CTE_HANDOVER_SHIP",
      { toOrg: "Org2MSP", toRegion: "OTHER", toOrganizationId: "OUT-org" },
      "/handover/request",
    )
  ).body;
  assert.equal(
    (
      await record(
        lot,
        "TRANSPORTER",
        "CTE_RECEIVE_SHIP",
        {},
        "/handover/confirm",
      )
    ).status,
    403,
  );
  assert.equal(
    (await record(lot, "OUT", "CTE_RECEIVE_SHIP", {}, "/handover/confirm"))
      .status,
    403,
  );
  users.get("OUT").orgMsp = "Org2MSP";
  assert.equal((await call("/lots", "OUT")).body.length, 1);
  lot = (await record(lot, "OUT", "CTE_RECEIVE_SHIP", {}, "/handover/confirm"))
    .body;
  assert.equal(lot.regionCode, "OTHER");
  assert.equal((await call("/lots/LOT-TEST", "FARMER")).status, 200);
});

test("public trace uses allowlist; detects tamper, broken first link, empty history and missing lots", async () => {
  const lot = await create();
  lot.events[0].data = {
    password: "secret",
    note: "private contract",
    documentPath: "/uploads/private.pdf",
  };
  lots.set(lot.lotId, lot);
  const trace = await call("/public/trace/LOT-TEST");
  assert.equal(trace.status, 200);
  const text = JSON.stringify(trace.body);
  for (const hidden of [
    "secret",
    "private contract",
    "documentPath",
    "actorId",
    "currentHolder",
    "fabricIdentity",
  ])
    assert.equal(text.includes(hidden), false);
  assert.equal(trace.body.integrity.valid, false);
  assert.equal(verifyHistory([]).valid, false);
  assert.equal(
    verifyHistory([{ ...lot.events[0], previousEventId: "bogus" }]).brokenLinks
      .length,
    1,
  );
  assert.equal(publicProjection(lot, true).integrity.valid, null);
  assert.equal((await call("/public/trace/UNKNOWN")).status, 404);
  assert.equal((await call("/lots/UNKNOWN/qr")).status, 404);
  assert.equal(
    (await call("/lots/LOT-TEST/verify-documents", "ADMIN")).body.valid,
    null,
  );
});

test('LAN QR uses only the configured origin, canonical lot ID and fresh PNG, never request hosts or tokens', async () => {
  await create();
  const QRCode = require('qrcode'), original = QRCode.toBuffer;
  const previous = process.env.PUBLIC_BASE_URL, targets = [];
  QRCode.toBuffer = async (target, options) => {targets.push(target); return original(target, options);};
  try {
    process.env.PUBLIC_BASE_URL = 'http://192.168.50.20:3001/';
    const response = await fetch(base + '/lots/lot-test/qr?token=ignored-fixture', {headers: {Host: 'attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https'}});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(targets.at(-1), 'http://192.168.50.20:3001/trace/LOT-TEST');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()).subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    process.env.PUBLIC_BASE_URL = 'http://192.168.50.21:3001';
    assert.equal((await fetch(base + '/lots/LOT-TEST/qr')).status, 200);
    assert.equal(targets.at(-1), 'http://192.168.50.21:3001/trace/LOT-TEST');
    for (const invalid of ['', 'file:///tmp', 'http://user:fixture@host', 'http://host/path', 'http://host/?token=fixture', 'http://host/#fixture']) {
      process.env.PUBLIC_BASE_URL = invalid;
      assert.equal((await fetch(base + '/lots/LOT-TEST/qr')).status, 503);
    }
    assert.equal((await fetch(base + '/lots/BAD%2FID/qr')).status, 400);
  } finally {
    QRCode.toBuffer = original;
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = previous;
  }
});

test('CORS permits the configured LAN/local frontend, not arbitrary origins, and never bypasses authentication', async () => {
  const previous = process.env.PUBLIC_BASE_URL;
  try {
    process.env.PUBLIC_BASE_URL = 'http://192.168.50.20:3001';
    for (const origin of [process.env.PUBLIC_BASE_URL, 'http://localhost:3001', 'http://127.0.0.1:3000']) {
      const response = await fetch(base + '/health', {headers: {Origin: origin}});
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
    const denied = await fetch(base + '/health', {headers: {Origin: 'http://attacker.invalid'}});
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(base + '/users', {headers: {Origin: process.env.PUBLIC_BASE_URL}})).status, 401);
  } finally {if (previous === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = previous;}
});

test('failed save does not advance RAM and retry uses persisted SQL snapshot', async () => {
  let lot = await create();
  const save = storage.saveLot;
  storage.saveLot = async () => { throw new Error('Injected storage failure'); };
  try { assert.equal((await record(lot, 'FARMER', 'CTE_HARVEST')).status, 500); }
  finally { storage.saveLot = save; }
  assert.equal(domain.getLot(lot.lotId).status, 'CREATED');
  const response = await record(lot, 'FARMER', 'CTE_HARVEST');
  assert.equal(response.status, 201);
  lot = response.body;
  lot = (await record(lot, 'FARMER', 'CTE_RECALL', {}, '/recall')).body;
  assert.equal((await record(lot, 'FARMER', 'CTE_RECALL', {}, '/recall')).status, 409);
});

test('creation rejects unowned document anchors before any Gateway submit',async()=>{
 const fabric=require('./fabric'),original=fabric.submitCreateLot;let submitted=false;
 process.env.FABRIC_ENABLED='true';fabric.submitCreateLot=async()=>{submitted=true;throw new Error('Must never submit');};
 try {
  const result=await call('/lots','FARMER','POST',{lotId:'UNOWNED-DOC',productName:'QA',origin:'TG',harvestDate:'2026-11-06',location:'QA',regionCode:'TG-001',processorOrganizationId:'PROCESSOR-org',distributorOrganizationId:'DISTRIBUTOR-org',data:{documentHash:'a'.repeat(64)}});
  assert.equal(result.status,400);assert.equal(submitted,false);assert.equal(lots.size,0);
 } finally {fabric.submitCreateLot=original;process.env.FABRIC_ENABLED='false';}
});

test('application refuses database-only lot creation outside isolated QA',async()=>{
 process.env.NODE_ENV='production';
 try {const result=await call('/lots','FARMER','POST',{lotId:'MUST-USE-FABRIC',productName:'QA',origin:'TG',harvestDate:'2026-11-06',location:'QA',processorOrganizationId:'PROCESSOR-org',distributorOrganizationId:'DISTRIBUTOR-org'});assert.equal(result.status,503);assert.equal(result.body.code,'FABRIC_REQUIRED');assert.equal(lots.size,0);}
 finally{process.env.NODE_ENV='test';}
});
test('commit receipt survives a failed ledger-history read after successful create',async()=>{
 const fabric=require('./fabric'),submit=fabric.submitCreateLot,history=fabric.history;
 process.env.FABRIC_ENABLED='true';
 fabric.submitCreateLot=async input=>({...domain.createLot(input,false),lastEventId:'committed-tx'});
 fabric.history=async()=>{throw new Error('Injected post-commit query failure');};
 try{
  const result=await call('/lots','FARMER','POST',{lotId:'POST-COMMIT-READ',productName:'QA',origin:'TG',harvestDate:'2026-11-06',location:'QA',regionCode:'TG-001',processorOrganizationId:'PROCESSOR-org',distributorOrganizationId:'DISTRIBUTOR-org'});
  assert.equal(result.status,503);assert.equal(result.body.transactionId,'committed-tx');assert.equal(result.body.ledgerCommitted,true);assert.equal(result.body.reconciliationRequired,true);assert.equal(lots.size,0);
 }finally{fabric.submitCreateLot=submit;fabric.history=history;process.env.FABRIC_ENABLED='false';}
});

test('signer onboarding failures preserve the identity error code over HTTP',async()=>{
 const fabric=require('./fabric'),original=fabric.submitCreateLot;
 process.env.FABRIC_ENABLED='true';fabric.submitCreateLot=async()=>{throw Object.assign(new Error('Tài khoản chưa có chứng thư Fabric để ký giao dịch.'),{step:'Identity',code:'FABRIC_IDENTITY_REQUIRED',statusCode:403});};
 try{
  const result=await call('/lots','FARMER','POST',{lotId:'PENDING-SIGNER',productName:'QA',origin:'TG',harvestDate:'2026-11-08',location:'TG',regionCode:'TG-001',processorOrganizationId:'PROCESSOR-org',distributorOrganizationId:'DISTRIBUTOR-org'});
  assert.equal(result.status,403);assert.equal(result.body.step,'Identity');assert.equal(result.body.code,'FABRIC_IDENTITY_REQUIRED');assert.match(result.body.message,/chứng thư Fabric/);assert.equal(lots.size,0);
 }finally{fabric.submitCreateLot=original;process.env.FABRIC_ENABLED='false';}
});
