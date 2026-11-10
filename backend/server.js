require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const QRCode = require('qrcode');
const domain = require('./domain');
const workflow = require('../chaincode/src/workflow');
const storage = require('./storage');
const fabric = require('./fabric');
const auth = require('./auth');
const policy = require('./authorization');
const {verifyHistory, publicProjection} = require('./integrity');

const app = express();
// Local writes are restricted to an explicitly isolated QA database.
const localQa = () => process.env.NODE_ENV==='test' && /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE===process.env.MYSQL_TEST_DATABASE;
const uploadDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
function publicOrigin() {
  try {
    const url = new URL(process.env.PUBLIC_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Origin required');
    return url.origin;
  } catch {
    throw Object.assign(new Error('Configure PUBLIC_BASE_URL as an HTTP(S) origin without credentials, path, query or fragment'), {statusCode: 503});
  }
}
app.use(cors({origin(origin, callback) {
  const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'];
  try {allowed.push(publicOrigin());} catch { /* Local development still works before a public QR origin is configured. */ }
  callback(null, !origin || allowed.includes(origin));
}}));
app.use((req,res,next)=>{const json=res.json.bind(res);res.json=body=>{if(res.statusCode>=400 && body && typeof body==='object'){const message=body.message || body.error || 'Request failed';body={step:[401,403].includes(res.statusCode)?'Identity':'System',code:`HTTP_${res.statusCode}`,message,...body};}return json(body);};res.on('finish',()=>{if(req.user && req.method!=='GET' && res.statusCode>=400) void storage.saveFailure(req.user,req.method,req.path,res.statusCode).catch(()=>console.error('Failed request audit unavailable'));});next();});
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.is('application/json') && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({error: 'JSON body must be an object'});
  next();
});


app.get('/', (_req, res) => res.json({
  name: 'TraceChain API',
  status: 'ok',
  frontend: process.env.PUBLIC_BASE_URL || null,
  health: '/api/health',
}));

async function hydrateFabricLot(lot) {
  const events = await fabric.history(lot.lotId);
  return {
    ...lot,
    source: 'FABRIC',
    events,
    eventCount: events.length,
    createdAt: events[0]?.timestamp || new Date().toISOString(),
    lastEventId: lot.lastEventId || events.at(-1)?.eventId || null,
  };
}

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  mysql: storage.isEnabled() ? 'enabled' : 'disabled',
  fabric: fabric.enabled() ? 'enabled' : 'disabled',
}));
async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const session = auth.getSession(token);
    if (!session) return res.status(401).json({error: 'Authentication required'});
    const user = (await storage.listUsers(session.username))?.find(user => user.username === session.username);
    if (!user || user.status !== 'ACTIVE' || user.authorized === 0) {
      auth.revokeSession(token);
      return res.status(401).json({error: 'Session expired or account disabled'});
    }
    req.user = user;
    req.sessionToken = token;
    next();
  } catch (error) { next(error); }
}
async function loadLot(lotId) {
  const lot = storage.isEnabled() ? await storage.getLot(lotId) : (await storage.getLot(lotId)) || domain.getLot(lotId);
  if (!lot) throw Object.assign(new Error('Lot was not found'), {statusCode: 404});
  if (lot.source === 'FABRIC') {
    if (!fabric.enabled()) throw Object.assign(new Error('Fabric is disabled for a ledger-backed lot'), {statusCode: 503});
    return hydrateFabricLot(await fabric.readLot(lot.lotId));
  }
  return {...lot, source: 'LOCAL'};
}
const canAccessLot = policy.canAccessLot;
function requirePermission(permission) {
  return (req,res,next) => policy.hasPermission(req.user,permission) ? next() : res.status(403).json({error: `Permission required: ${permission}`});
}
async function requireLotAccess(req, res, next) {
  try {
    req.lot = await loadLot(req.params.lotId);
    req.params.lotId = req.lot.lotId;
    if (!policy.hasPermission(req.user,'LOT_READ') || !canAccessLot(req.user, req.lot)) return res.status(403).json({step: 'Identity', code: 'REGION_DENIED', message: 'Tác nhân không thuộc phạm vi lô hoặc bên nhận được chỉ định'});
    next();
  } catch (error) { next(error); }
}
function requireAdmin(req, res, next) {
  if (!policy.isAdmin(req.user)) return res.status(403).json({error: 'Admin permission required'});
  next();
}
function parseChaincodeError(error) {
  if (error.step && error.code) return {step:error.step,code:error.code,message:error.message};
  try {
    const message = error.details?.find?.(item => item.message?.includes('{'))?.message || error.message;
    const parsed = JSON.parse(message.slice(message.indexOf('{')));
    if (parsed.step && parsed.code) return parsed;
  } catch {
    // Keep the original error when Fabric returned a non-JSON message.
  }
  return {step: 'System', code: 'REQUEST_FAILED', message: error.message};
}
const loginAttempts = new Map();
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || username.length>80 || !password || password.length>1024) return res.status(400).json({error: 'username and password are required'});
    const key = `${req.ip}/${username.toLowerCase()}`;
    const now = Date.now();
    const attempts = loginAttempts.get(key);
    if (attempts && attempts.until > now && attempts.count >= 10) return res.status(429).json({error: 'Too many failed logins; try again after 15 minutes'});
    const user = await storage.authenticateUser(username, password);
    if (!user) {
      if (loginAttempts.size > 10000) for (const [id, entry] of loginAttempts) if (entry.until < now) loginAttempts.delete(id);
      if (loginAttempts.size >= 10000 && !attempts) return res.status(429).json({error: 'Too many login attempts'});
      loginAttempts.set(key, {count: attempts && attempts.until > now ? attempts.count + 1 : 1, until: attempts && attempts.until > now ? attempts.until : now + 15 * 60 * 1000});
    } else loginAttempts.delete(key);
    if (!user) return res.status(401).json({error: 'Invalid username or password'});
    res.json({token: auth.createSession(user), user});
  } catch (error) { next(error); }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));
app.post('/api/auth/logout', requireAuth, (req, res) => {
  auth.revokeSession(req.sessionToken);
  res.status(204).end();
});
app.post('/api/auth/change-password', requireAuth, accountLimit, async (req, res, next) => {
  try {
    if (typeof req.body.currentPassword !== 'string' || typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 12 || req.body.newPassword.length > 1024) return res.status(400).json({error: 'Current password and new password of 12–1024 characters are required'});
    if (!await storage.authenticateUser(req.user.username, req.body.currentPassword)) return res.status(403).json({error: 'Current password is incorrect'});
    await storage.resetUserPassword(req.user.username, req.body.newPassword, req.user);
    auth.revokeUserSessions(req.user.username);
    await storage.saveAudit({actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'PASSWORD_CHANGED', target: req.user.username});
    res.status(204).end();
  } catch (error) { next(error); }
});
app.get('/api/health/dependencies', async (_req, res) => {
  try { await storage.listOrganizations(); const status = await fabric.readiness(); res.json({mysql: storage.isEnabled(), fabric: status}); }
  catch (_error) { res.status(503).json({error: 'Dependency unavailable or Fabric ABI incompatible'}); }
});
app.post('/api/fabric/lots/:lotId/reconcile', requireAuth, requirePermission('TRACE_VALIDATE'), async (req, res, next) => {
  try {
    if (!fabric.enabled()) return res.status(503).json({error: 'Fabric is disabled'});
    const saved = await storage.getLot(req.params.lotId);
    if (saved && saved.source !== 'FABRIC') return res.status(409).json({error: 'Existing local lot cannot be replaced with a ledger lot'});
    const lot = await hydrateFabricLot(await fabric.readLot(saved?.lotId || workflow.lotId(req.params.lotId)));
    if (!canAccessLot(req.user, lot)) return res.status(403).json({error: 'Lot access denied'});
    await storage.saveLot(lot, saved?.lastEventId || null, {actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'FABRIC_RECONCILED'});
    res.json(lot);
  } catch (error) { next(error); }
});
// Rate limits are bounded per process, matching the existing session deployment model.
const accountAttempts=new Map();
function accountLimit(req,res,next) {
  const now=Date.now(), key=req.ip;
  for(const [id,entry] of accountAttempts) if(entry.until<=now) accountAttempts.delete(id);
  const entry=accountAttempts.get(key) || {count:0,until:now+15*60*1000};
  if(entry.count>=30 || (accountAttempts.size>=10000 && !accountAttempts.has(key))) return res.status(429).json({error:'Quá nhiều yêu cầu; thử lại sau 15 phút'});
  entry.count++;accountAttempts.set(key,entry);next();
}
function invitationDelivery() {
  // shortcut: no mail transport, enable invitations only in explicit development/test until mail delivery is configured.
  if (!['development','test'].includes(process.env.NODE_ENV)) throw Object.assign(new Error('Chưa cấu hình gửi lời mời cho production; không tạo hoặc hiển thị token'),{statusCode:503});
  return {token:randomBytes(32).toString('hex'),expiresAt:new Date(Date.now()+24*60*60*1000)};
}
function invitationResponse(res,invitation) {
  res.set('Cache-Control','no-store').status(201).json({message:'Lời mời có hiệu lực 24 giờ. Chuyển riêng cho người nhận.',activationToken:invitation.token,expiresAt:invitation.expiresAt});
}
app.post('/api/auth/accept-invitation',accountLimit,async(req,res,next)=>{
  try {
    if(typeof req.body.token!=='string' || !/^[a-f0-9]{64}$/.test(req.body.token) || typeof req.body.password!=='string' || req.body.password.length<12 || req.body.password.length>1024) return res.status(400).json({error:'Lời mời hợp lệ và mật khẩu 12–1024 ký tự là bắt buộc'});
    await storage.acceptInvitation(req.body.token,req.body.password);res.status(204).end();
  }catch(error){next(error);}
});
app.post('/api/users/invitations',requireAuth,requirePermission('USER_CREATE'),accountLimit,async(req,res,next)=>{
  try {
    const role=policy.normalizeRole(req.body.role);
    if(policy.isAdmin(req.user) ? role!=='BUSINESS_ADMIN' : role!==policy.organizationTypes[req.user.organizationType]?.role) return res.status(403).json({error:'Vai trò không nằm trong phạm vi cấp phát'});
    if(!policy.isAdmin(req.user) && req.body.organizationId && req.body.organizationId!==req.user.organizationId) return res.status(403).json({error:'Không được cấp tài khoản cho doanh nghiệp khác'});
    if(typeof req.body.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email) || typeof req.body.fullName!=='string' || !req.body.fullName.trim()) return res.status(400).json({error:'Họ tên và email hợp lệ là bắt buộc'});
    if(policy.isAdmin(req.user) && !req.body.organizationId) return res.status(400).json({error:'Doanh nghiệp là bắt buộc'});
    const invitation=invitationDelivery();
    await storage.saveUser({username:req.body.username,fullName:req.body.fullName,email:req.body.email,phone:req.body.phone,role,organizationId:policy.isAdmin(req.user)?req.body.organizationId:req.user.organizationId,regionCode:req.body.regionCode || (role==='BUSINESS_ADMIN'?'GLOBAL':undefined),password:randomBytes(48).toString('hex'),invitation,auditActor:req.user});
    invitationResponse(res,invitation);
  }catch(error){next(error);}
});
app.post('/api/users/:username/invitation',requireAuth,requirePermission('USER_CREATE'),accountLimit,async(req,res,next)=>{
  try{const invitation=invitationDelivery();await storage.reissueInvitation(req.params.username,invitation,req.user);invitationResponse(res,invitation);}catch(error){next(error);}
});
app.get('/api/fabric-identities',requireAuth,async(req,res,next)=>{
  try {const identities=await storage.listIdentityStatuses();res.json(identities.filter(identity=>identity.userId===req.user.userId || policy.isAdmin(req.user) || (req.user.role==='BUSINESS_ADMIN' && identity.organizationId===req.user.organizationId)));}catch(error){next(error);}
});
app.get('/api/fabric-identity-requests',requireAuth,requirePermission('USER_READ'),async(req,res,next)=>{
  try {res.json((await storage.listIdentityRequests()).filter(row=>policy.isAdmin(req.user) || row.organizationId===req.user.organizationId));}catch(error){next(error);}
});
for(const operation of ['request','disable']) app.post(`/api/users/:username/fabric-identity/${operation}`,requireAuth,requirePermission(operation==='request'?'IDENTITY_REQUEST':'IDENTITY_DISABLE'),accountLimit,async(req,res,next)=>{
  try{await storage.manageIdentity(req.params.username,req.user,operation);res.status(204).end();}catch(error){next(error);}
});
app.post('/api/users/:username/fabric-identity/issue',requireAuth,requirePermission('IDENTITY_ISSUE'),accountLimit,async(req,res,next)=>{
  try{await storage.approveIdentityIssuance(req.params.username,req.user);res.status(202).json({message:'Yêu cầu đã được duyệt và đang chờ CA operator cấp chứng thư'});}catch(error){next(error);}
});
app.get('/api/business/activity',requireAuth,requirePermission('USER_READ'),async(req,res,next)=>{
  try{res.json((await storage.listIdentityAudit()).filter(row=>policy.isAdmin(req.user) || row.organizationId===req.user.organizationId));}catch(error){next(error);}
});
app.get('/api/users', requireAuth, requirePermission('USER_READ'), async (req, res, next) => {
  try { res.json(((await storage.listUsers()) || []).filter(user=>policy.isAdmin(req.user) || policy.canManageUser(req.user,user))); } catch (error) { next(error); }
});
async function saveUserHandler(req,res,next) {
  try {
    const username = req.params.username || req.body.username;
    if (typeof username !== 'string' || !username.trim() || typeof req.body.role !== 'string' || !policy.roles.includes(policy.normalizeRole(req.body.role))) return res.status(400).json({error: 'Valid username and role required'});
    if (req.params.username && req.body.username && req.params.username !== req.body.username) return res.status(400).json({error: 'Username is immutable'});
    if (policy.isAdmin(req.user) && policy.normalizeRole(req.body.role) !== 'SUPER_ADMIN' && !req.body.organizationId) return res.status(400).json({error: 'Business organizationId is required'});
    if (username === req.user.username) return res.status(400).json({error: 'Self role changes are forbidden; use password change'});
    const existing = (await storage.listUsers(username))[0];
    if (existing?.username === req.user.username) return res.status(400).json({error:'Self role changes are forbidden'});
    if (!req.params.username && existing) return res.status(409).json({error: 'Username already exists; use explicit update'});
    if (req.params.username && !existing) return res.status(404).json({error: 'User not found'});
    if (!policy.hasPermission(req.user,existing ? 'USER_UPDATE' : 'USER_CREATE')) return res.status(403).json({error: 'User write permission required'});
    if (!policy.isAdmin(req.user)) {
      if ((existing && !policy.canManageUser(req.user,existing)) || req.body.role !== policy.organizationTypes[req.user.organizationType]?.role || (req.body.organizationId && req.body.organizationId !== req.user.organizationId)) return res.status(403).json({error:'Không có quyền quản lý tài khoản này'});
      if (!existing || req.body.password) return res.status(403).json({error:'Dùng lời mời để cấp tài khoản; nhân viên tự thiết lập mật khẩu'});
    }
    const organizationId=policy.isAdmin(req.user)?req.body.organizationId:req.user.organizationId;
    await storage.saveUser({username:existing?.username || username,role:req.body.role,organizationId,fullName:req.body.fullName,email:req.body.email,phone:req.body.phone,regionCode:req.body.regionCode,password:req.body.password,auditActor:req.user});
    auth.revokeUserSessions(existing?.username || username);
    res.status(existing ? 200 : 201).json((await storage.listUsers(username))[0]);
  } catch(error) {next(error);}
}
app.post('/api/users',requireAuth,requirePermission('USER_CREATE'),saveUserHandler);
app.patch('/api/users/:username',requireAuth,requirePermission('USER_UPDATE'),saveUserHandler);
app.patch('/api/users/:username/status', requireAuth, requirePermission('USER_DISABLE'), async (req, res, next) => {
  try {
    const status = req.body.status;
    const target=(await storage.listUsers(req.params.username))[0];
    if (!target || !policy.canManageUser(req.user,target)) return res.status(404).json({error:'User not found'});
    req.params.username=target.username;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({error: 'Unsupported account status'});
    if (req.params.username === req.user.username && status === 'INACTIVE') {
      return res.status(400).json({error: 'You cannot deactivate your own account'});
    }
    await storage.setUserStatus(req.params.username, status, req.user);
    auth.revokeUserSessions(req.params.username);
    await storage.saveAudit({actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'USER_STATUS_CHANGED', target: req.params.username, details: {status}});
    res.json((await storage.listUsers()).find((user) => user.username === req.params.username));
  } catch (error) { next(error); }
});
app.post('/api/users/:username/reset-password', requireAuth, requireAdmin, requirePermission('USER_UPDATE'), accountLimit, async (req, res, next) => {
  try {
    if (typeof req.body.password !== 'string' || req.body.password.length < 8) {
      return res.status(400).json({error: 'password must contain at least 8 characters'});
    }
    const target=(await storage.listUsers(req.params.username))[0];
    if(!target) return res.status(404).json({error:'User not found'});
    if(target.status==='PENDING_ACTIVATION') return res.status(409).json({error:'Tài khoản phải tự kích hoạt bằng lời mời'});
    await storage.resetUserPassword(target.username, req.body.password, req.user);
    auth.revokeUserSessions(target.username);
    await storage.saveAudit({actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'USER_PASSWORD_RESET', target: req.params.username});
    res.json({message: 'Password reset successfully'});
  } catch (error) { next(error); }
});
app.get('/api/organizations', requireAuth, requireAdmin, requirePermission('ORGANIZATION_READ'), async (_req, res, next) => {
  try {
    const organizations = await storage.listOrganizations();
    res.json(organizations || []);
  } catch (error) { next(error); }
});
app.get('/api/fabric-organizations', requireAuth, requireAdmin, requirePermission('ORGANIZATION_READ'), async (_req,res,next) => {
  try {res.json(await storage.listFabricOrganizations());} catch(error) {next(error);}
});
app.get('/api/business-organizations', requireAuth, requirePermission('ORGANIZATION_READ'), async (req,res,next) => {
  try {const rows = await storage.listBusinessOrganizations(); res.json(rows.map(row => policy.isAdmin(req.user) || row.organizationId === req.user.organizationId ? row : {organizationId:row.organizationId,code:row.code,name:row.name,type:row.type,organizationType:row.organizationType,mspId:row.mspId,status:row.status}));} catch(error) {next(error);}
});
app.post('/api/business-organizations', requireAuth, requirePermission('ORGANIZATION_CREATE'), async (req,res,next) => {
  try {res.status(201).json(await storage.saveBusinessOrganization(req.body,null,req.user));} catch(error) {next(error);}
});
app.patch('/api/business-organizations/:id', requireAuth, requirePermission('ORGANIZATION_UPDATE'), async (req,res,next) => {
  try {
    const existing = (await storage.listBusinessOrganizations()).find(org => org.organizationId === req.params.id);
    if (!existing) return res.status(404).json({error: 'Organization not found'});
    if (req.body.status && req.body.status !== existing.status && !policy.hasPermission(req.user,'ORGANIZATION_DISABLE')) return res.status(403).json({error: 'Organization disable permission required'});
    const updated = await storage.saveBusinessOrganization({...existing,...req.body},req.params.id,req.user);
    const users = await storage.listUsers();
    for (const user of users.filter(user => user.organizationId === req.params.id)) auth.revokeUserSessions(user.username);
    res.json(updated);
  } catch(error) {next(error);}
});
app.get('/api/admin/permissions', requireAuth, requirePermission('USER_READ'), async (req,res,next) => {
  try {const data=await storage.listRolePermissions(); if(!policy.isAdmin(req.user)){const allowed=policy.organizationTypes[req.user.organizationType]?.role;data.roles=data.roles.filter(role=>role.code===allowed);data.grants=data.grants.filter(grant=>grant.role===allowed);data.permissions=data.permissions.filter(permission=>data.grants.some(grant=>grant.permission===permission.code));}res.json(data);} catch(error) {next(error);}
});
app.get('/api/admin/fabric-identities', requireAuth, requirePermission('BLOCKCHAIN_MONITOR'), async (_req,res,next) => {
  try {res.json(await storage.listIdentityStatuses());} catch(error) {next(error);}
});
app.get('/api/admin/transactions',requireAuth,requirePermission('BLOCKCHAIN_MONITOR'),async (req,res,next)=>{
  try {
    const page=Number(req.query.page || 1),size=Number(req.query.size || 20);
    if (!Number.isInteger(page) || page<1 || !Number.isInteger(size) || size<1 || size>100) return res.status(400).json({error:'Invalid pagination'});
    const rows=(await storage.listLots()) || []; const items=[];
    for (const row of rows.filter(row=>row.source==='FABRIC')) {
      const lot=await loadLot(row.lotId);
      for (const event of lot.events) items.push({transactionId:event.eventId,lotId:lot.lotId,userId:event.userId || null,actorId:event.actorId,businessOrganizationId:event.businessOrganizationId || null,mspId:event.actorOrg,eventType:event.eventType,timestamp:event.timestamp});
    }
    items.sort((left,right)=>right.timestamp.localeCompare(left.timestamp));
    const selected = await Promise.all(items.slice((page-1)*size,page*size).map(async item => {const receipt=await fabric.commitStatus(item.transactionId);return {...item,validationCode:receipt.validationCode,status:receipt.successful?'COMMITTED_VALID':'COMMITTED_INVALID'};}));
    res.json({items:selected,total:items.length,page,size,scope:'Peer QSCC validation codes for application-associated ledger events; rejected proposals are not inferred'});
  }catch(error){next(error);}
});
app.get('/api/admin/transaction-failures',requireAuth,requirePermission('BLOCKCHAIN_MONITOR'),async(_req,res,next)=>{try{res.json(await storage.listFailures());}catch(error){next(error);}});
app.get('/api/admin/benchmarks',requireAuth,requirePermission('BLOCKCHAIN_MONITOR'),(_req,res,next)=>{try{const file=path.join(__dirname,'../reports/fabric-benchmark.json');res.json(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null);}catch(error){next(error);}});
app.get('/api/admin/activity', requireAuth, requirePermission('AUDIT_LOG_READ'), async (req,res,next) => {
  try {res.json(await storage.listIdentityAudit(typeof req.query.userId === 'string' ? req.query.userId : null));} catch(error) {next(error);}
});
app.get('/api/actors', requireAuth, requireAdmin, requirePermission('USER_READ'), async (_req, res, next) => {
  try {
    const actors = await storage.listActors();
    res.json(actors || []);
  } catch (error) { next(error); }
});
app.get('/api/admin/audit-log', requireAuth, requirePermission('AUDIT_LOG_READ'), async (_req, res, next) => {
  try { res.json(await storage.listAudit()); } catch (error) { next(error); }
});
// Legacy clients and seed/enrollment tools still depend on this API; Admin UI uses /users.
app.post('/api/actors', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const requiredFields = ['actorId', 'mspId', 'fabricIdentity', 'fullName', 'actorType'];
    const missing = requiredFields.find((field) => typeof req.body[field] !== 'string' || !req.body[field].trim());
    if (missing) return res.status(400).json({ error: `${missing} is required` });
    if (!Array.isArray(req.body.roles) || req.body.roles.length === 0 || req.body.roles.some(role => !['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'].includes(role))) {
      return res.status(400).json({ error: 'roles must contain at least one role' });
    }
    const expectedMsp = {FARMER: 'Org1MSP', PROCESSOR: 'Org1MSP', TRANSPORTER: 'Org2MSP', DISTRIBUTOR: 'Org3MSP'};
    if (req.body.roles.some(role => expectedMsp[role] !== req.body.mspId)) return res.status(400).json({error: 'Role does not belong to organization MSP'});
    await storage.saveActor(req.body);
    await storage.saveAudit({actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'ACTOR_SAVED', target: req.body.actorId});
    const actors = await storage.listActors();
    res.status(201).json(actors.find((actor) => actor.actorId === req.body.actorId));
  } catch (error) { next(error); }
});
app.get('/api/lots', requireAuth, requirePermission('LOT_READ'), async (req, res, next) => {
  try {
    const rows = (await storage.listLots()) || domain.listLots();
    const lots = await Promise.all(rows.map(async row => row.source === 'FABRIC' || row.status === 'WAITING_SHIP' ? {...row, ...await loadLot(row.lotId)} : row));
    res.json(lots.filter(lot => canAccessLot(req.user, lot)));
  } catch (error) { next(error); }
});
app.get('/api/lots/:lotId', requireAuth, requirePermission('LOT_READ'), requireLotAccess, (req, res) => res.json(req.lot));
async function publicTrace(req, res, next) {
  try { const lot = await loadLot(req.params.lotId); const result = publicProjection(lot, lot.source === 'FABRIC'); const organizations = await storage.listBusinessOrganizations(); result.events = result.events.map((event,index) => ({...event,businessOrganizationName: organizations.find(org => org.organizationId === lot.events[index].businessOrganizationId)?.name})); result.organizations = organizations.filter(org => policy.relatedOrganizations(lot).includes(String(org.organizationId))).map(org => ({organizationId:org.organizationId,name:org.name,type:org.type,mspId:org.mspId})); if (lot.source === 'FABRIC') result.integrity = {...await fabric.validateHistory(lot.lotId), source: 'FABRIC'}; res.json(result); }
  catch (error) { next(error); }
}
app.get('/api/public/lots/:lotId', publicTrace);
app.get('/api/public/trace/:lotId', publicTrace);
app.get('/api/lots/:lotId/qr', async (req, res, next) => {
  try {
    const lot = await loadLot(workflow.lotId(req.params.lotId));
    const target = new URL(`/trace/${encodeURIComponent(lot.lotId)}`, publicOrigin()).href;
    const png = await QRCode.toBuffer(target, {type: 'png', width: 360, margin: 2});
    res.set('Cache-Control', 'no-store').type('png').send(png);
  } catch (error) { next(error); }
});
app.post('/api/documents', requireAuth, upload.single('document'), async (req, res, next) => {
  try {
  if (!req.file) return res.status(400).json({ error: 'document is required' });
  if (typeof req.body.lotId !== 'string' || !req.body.lotId.trim()) return res.status(400).json({ error: 'lotId is required' });
  const lot = await loadLot(req.body.lotId);
  if (!policy.hasPermission(req.user,'LOT_READ') || !canAccessLot(req.user, lot) || policy.isAdmin(req.user)) return res.status(403).json({error: 'Document upload not permitted'});
  const bytes = req.file.buffer;
  const allowed = (req.file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-') ||
    (req.file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
    (req.file.mimetype === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
  if (!allowed) return res.status(400).json({error: 'Only nonempty PDF, PNG or JPEG documents with matching content are accepted'});
  const fileHash = createHash('sha256').update(req.file.buffer).digest('hex');
  const safeName = `${fileHash}-${path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const destination = path.join(uploadDirectory, safeName);
  if (!fs.existsSync(destination)) fs.writeFileSync(destination, req.file.buffer, {flag: 'wx', mode: 0o600});
  await storage.saveDocument({ lotId: req.body.lotId || 'UNASSIGNED', originalName: req.file.originalname, filePath: `/uploads/${safeName}`, fileHash, uploadedBy: req.user.actorId || req.user.username });
  res.status(201).json({ fileName: req.file.originalname, fileHash, path: `/uploads/${safeName}` });
  } catch (error) { next(error); }
});

app.post('/api/lots', requireAuth, requirePermission('LOT_CREATE'), async (req, res, next) => {
  try {
  if (!req.user) return res.status(401).json({error: 'Authentication required'});
  if (!fabric.enabled() && !localQa()) return res.status(503).json({code:'FABRIC_REQUIRED',message:'Fabric must be ready to create a new lot'});
  if (req.user.role !== 'FARMER') return res.status(403).json({error: 'Only FARMER can create lots'});
  if (typeof req.body.lotId !== 'string' || !req.body.lotId.trim()) return res.status(400).json({error: 'lotId is required'});
  const canonicalLotId=workflow.lotId(req.body.lotId);
  if (await storage.getLot(canonicalLotId)) return res.status(409).json({error: 'Lot already exists'});
  const regionCode = req.body.regionCode || req.user.regionCode;
  if (regionCode !== req.user.regionCode) return res.status(403).json({error: 'Region does not match account'});
  if (!regionCode || regionCode === 'GLOBAL') return res.status(400).json({step: 'Identity', code: 'REGION_REQUIRED', message: 'Tác nhân và lô phải có mã vùng cụ thể'});
  await storage.organizationForEvent(req.body.processorOrganizationId,'PROCESSING_FACILITY');
  await storage.organizationForEvent(req.body.distributorOrganizationId,'DISTRIBUTION_COMPANY');
  if (req.body.data != null && (typeof req.body.data !== 'object' || Array.isArray(req.body.data) || Object.keys(req.body.data).length)) return res.status(400).json({step:'Event',code:'CREATE_DATA',message:'Create accepts lot metadata only; upload documents after creation'});
  const identityInput = {...req.body,lotId:canonicalLotId, timestamp: undefined, regionCode, actorId: req.user.userId, userId: req.user.userId, organizationId: req.user.organizationId, actorRole: req.user.role};
  const draft = domain.createLot(identityInput, false);
  const lot = fabric.enabled()
    ? await fabric.submitCreateLot({...identityInput,data: {...req.body.data,processorOrganizationId: req.body.processorOrganizationId,distributorOrganizationId: req.body.distributorOrganizationId}}, req.user)
    : draft;
  lot.source=fabric.enabled()?'FABRIC':'LOCAL';
  try {
  if (fabric.enabled()) Object.assign(lot, await hydrateFabricLot(lot));
  await storage.saveLot(lot, null, {actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: 'CTE_CREATE'});} catch(error) {if(lot.source==='FABRIC') Object.assign(error,{statusCode:503,commitReceipt:{lotId:lot.lotId,transactionId:lot.lastEventId,ledgerCommitted:true,reconciliationRequired:true}});throw error;}
  domain.restoreLot(lot);
  res.status(201).json(lot);
  } catch (error) { next(error); }
});

app.post('/api/lots/:lotId/events', requireAuth, requireLotAccess, (req, res, next) => {
  if (policy.isAdmin(req.user)) return next(Object.assign(new Error('Admin cannot record supply-chain events'), {statusCode: 403}));
  return submitAndStoreEvent(req, res, next, req.body);
});
async function submitAndStoreEvent(req, res, next, eventInput, fabricSubmit = fabric.submitEvent) {
  try {
    if (req.lot.source !== 'FABRIC' && !localQa()) return res.status(409).json({code:'LOCAL_READ_ONLY',message:'Local historical lots are read-only; create a new lot on Fabric'});
    if (eventInput.data != null && (typeof eventInput.data !== 'object' || Array.isArray(eventInput.data))) throw Object.assign(new Error('data must be a JSON object'), {statusCode: 400});
    const data = {...(eventInput.data || {})};
    if (workflow.requests.includes(eventInput.eventType)) { data.toOrg = eventInput.toOrg || data.toOrg; data.toRegion = eventInput.toRegion || data.toRegion; }
    if (req.lot.schemaVersion !== 4) return res.status(409).json({error: 'Legacy lot is read-only until separately reconciled'});
    const rule = domain.transitions[eventInput.eventType];
    if (!rule || !policy.hasPermission(req.user,policy.eventPermissions[eventInput.eventType])) return res.status(403).json({error: 'Event permission denied'});
    if (req.lot.status === 'RECALLED' || (rule.from !== '*' && rule.from !== req.lot.status)) return res.status(409).json({error: 'Event does not match current lot state'});
    if (!policy.canWriteEvent(req.user,req.lot,eventInput.eventType)) return res.status(403).json({step: 'Identity',code: 'BUSINESS_ORGANIZATION_DENIED',error: 'User permission or assigned business organization does not match'});
    if (workflow.requests.includes(eventInput.eventType)) {
      const destinationType=eventInput.eventType==='CTE_HANDOVER_PROCESSOR'?'PROCESSING_FACILITY':eventInput.eventType==='CTE_HANDOVER_RETAIL'?'DISTRIBUTION_COMPANY':'LOGISTICS_COMPANY';
      const destination = await storage.organizationForEvent(eventInput.toOrganizationId || data.toOrganizationId,destinationType);
      data.toOrganizationId = destination.id; data.toOrg = destination.mspId; data.toRegion = eventInput.toRegion || data.toRegion;
      if (typeof data.toRegion !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.toRegion)) return res.status(400).json({error: 'Invalid handover region'});
    }
    const payload = {...eventInput, data, toOrg: data.toOrg, toRegion: data.toRegion, actorId: req.user.userId, userId: req.user.userId, organizationId: req.user.organizationId, actorRole: req.user.role, orgMsp: req.user.orgMsp, actorRegion: req.user.regionCode, timestamp: undefined};
    if (data.documentHash && !(await storage.listDocuments(req.params.lotId)).some(doc => doc.fileHash === data.documentHash && !doc.eventId)) throw Object.assign(new Error('Document hash is not an available document of this lot'), {statusCode: 400});
    const draft=domain.recordEvent(req.params.lotId,payload,req.lot);
    const onChain = req.lot.source === 'FABRIC';
    const lot = onChain
      ? await fabricSubmit(req.params.lotId, payload, req.user)
      : draft;
    try {
    if (onChain) Object.assign(lot, await hydrateFabricLot(lot));
    await storage.saveLot(lot, req.lot.lastEventId, {actorUsername: req.user.username, userId: req.user.userId, organizationId: req.user.organizationId, action: payload.eventType});} catch(error) {if(onChain) Object.assign(error,{statusCode:503,commitReceipt:{lotId:lot.lotId,transactionId:lot.lastEventId,ledgerCommitted:true,reconciliationRequired:true}});throw error;}
    domain.restoreLot(lot);
    res.status(201).json(lot);
  } catch (error) { next(error); }
}
app.post('/api/lots/:lotId/handover/request', requireAuth, requireLotAccess, async (req, res, next) => {
  const eventType={FARMER:'CTE_HANDOVER_PROCESSOR',PROCESSOR:'CTE_HANDOVER_SHIP',TRANSPORTER:'CTE_HANDOVER_RETAIL'}[req.user.role];
  return submitAndStoreEvent(req,res,next,{...req.body,eventType});
});
app.post('/api/lots/:lotId/handover/confirm', requireAuth, requireLotAccess, async (req, res, next) => {
  const eventType={PROCESSOR:'CTE_RECEIVE_PROCESSOR',TRANSPORTER:'CTE_RECEIVE_SHIP',DISTRIBUTOR:'CTE_DISPATCH_RETAIL'}[req.user.role];
  return submitAndStoreEvent(req,res,next,{...req.body,eventType});
});
app.post('/api/lots/:lotId/recall', requireAuth, requireLotAccess, async (req, res, next) => {
  if (policy.isAdmin(req.user)) return next(Object.assign(new Error('Admin cannot record supply-chain events'), {statusCode: 403}));
  return submitAndStoreEvent(req, res, next, {...req.body, eventType: 'CTE_RECALL'});
});
for (const [type, rule] of Object.entries(require('./records').rules)) {
  app.get(`/api/lots/:lotId/${type}`, requireAuth, requireLotAccess, async (req, res, next) => {
    try {
      const page = Number(req.query.page || 1), size = Number(req.query.size || 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100) return res.status(400).json({error: 'Invalid page or size'});
      res.json(await storage.listRecords(req.params.lotId, type, page, size));
    } catch (error) { next(error); }
  });
  app.post(`/api/lots/:lotId/${type}`, requireAuth, requireLotAccess, async (req, res, next) => {
    try {
      const writePermission = type === 'cultivation-logs' ? 'LOT_HARVEST' : type === 'quality-checks' ? 'LOT_PROCESS' : type === 'transport-logs' ? 'HANDOVER_CONFIRM' : 'LOT_RECALL';
      const expectedOrg = type === 'cultivation-logs' ? req.lot.ownerOrganizationId : type === 'quality-checks' ? req.lot.processorOrganizationId : type === 'transport-logs' ? req.lot.currentHolderOrganizationId : req.user.organizationId;
      if (!policy.hasPermission(req.user,writePermission) || expectedOrg !== req.user.organizationId || !rule.roles.includes(req.user.role)) return res.status(403).json({error: 'Role cannot create this record'});
      if (req.lot.status === 'RECALLED' && type !== 'incidents') return res.status(409).json({error: 'Recalled lot is locked; record an incident instead'});
      if (type === 'transport-logs' && req.lot.status !== 'IN_TRANSIT') return res.status(409).json({error: 'Transport logs require IN_TRANSIT'});
      const record = require('./records').validateRecord(type, req.body);
      res.status(201).json(await storage.saveRecord(req.params.lotId, type, record, req.user));
    } catch (error) { next(error); }
  });
}
app.get('/api/lots/:lotId/history', requireAuth, requirePermission('TRACE_HISTORY_READ'), requireLotAccess, async (req, res, next) => {
  try { res.json(req.lot.events); } catch (error) { next(error); }
});
app.get('/api/lots/:lotId/validate', requireAuth, requirePermission('TRACE_VALIDATE'), requireLotAccess, async (req, res, next) => {
  try {
    const onChain = req.lot.source === 'FABRIC';
    const result = onChain ? await fabric.validateHistory(req.params.lotId) : verifyHistory(req.lot.events);
    if (onChain) { const mismatches = await storage.compareLedger(req.lot); result.anomalies.push(...mismatches); result.valid = result.valid && !mismatches.length; }
    res.json({...result, source: onChain ? 'FABRIC' : 'LOCAL', scope: onChain ? result.scope : 'HASH_AND_PREVIOUS_EVENT'});
  } catch (error) { next(error); }
});
app.get('/api/lots/:lotId/verify-documents', requireAuth, requireLotAccess, async (req, res, next) => {
  try {
    const lot = req.lot;
    const documents = await storage.listDocuments(req.params.lotId);
    const results = documents.map((document) => {
      const event = lot.events.find(item => item.eventId === document.eventId);
      const file = path.join(uploadDirectory, path.basename(document.filePath));
      const actualHash = fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
      return {...document, actualHash, onChainHash: event?.dataHash || null, valid: !!event && actualHash === document.fileHash && event.dataHash === document.fileHash};
    });
    res.json({valid: results.length ? results.every(item => item.valid) : null, documents: results});
  } catch (error) { next(error); }
});

app.get('/api/lots/:lotId/documents/:documentId', requireAuth, requireLotAccess, async (req, res, next) => {
  try {
    const document = (await storage.listDocuments(req.params.lotId)).find(item => String(item.documentId) === req.params.documentId);
    if (!document) return res.status(404).json({error: 'Document not found'});
    res.download(path.join(uploadDirectory, path.basename(document.filePath)), document.originalName, error => { if (error) next(error); });
  } catch (error) { next(error); }
});
app.use((error, _req, res, _next) => {
  const chainError = parseChaincodeError(error);
  const chainStatus = chainError.step === 'Identity' ? 403 : chainError.step === 'State' || chainError.step === 'Handover/History' ? 409 : chainError.step === 'Event' ? 400 : null;
  const statusCode = (error.name === 'CommitError' ? 409 : null) || chainStatus || (error.code === 'ER_DUP_ENTRY' || error.code === 'ER_LOCK_DEADLOCK' ? 409 : error.code === 'ER_DATA_TOO_LONG' ? 400 : null) || error.statusCode || error.status || (error instanceof multer.MulterError ? 400 : 500);
  console.error('Request failed:',{name:error.name,code:error.code,status:statusCode});
  const details = parseChaincodeError(error);
  res.status(error.commitReceipt ? 503 : statusCode).json({...(error.transactionId?{transactionId:error.transactionId}:{}),...error.commitReceipt,...(error.name === 'CommitError' ? {transactionId: error.transactionId, validationCode: error.code} : {}), step: details.step, code: details.code, message: statusCode >= 500 ? 'Internal server error' : details.message, error: statusCode >= 500 ? 'Internal server error' : details.message});
});

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  storage.connect()
    .then(async () => {
      if (fabric.enabled()) await fabric.readiness();
      return app.listen(port, () => console.log(`Traceability API listening on port ${port}`));
    })
    .catch(async (error) => { console.error('Dependency startup failed:', error.message); await fabric.close(); await storage.close(); process.exitCode = 1; });
}

module.exports = app;
