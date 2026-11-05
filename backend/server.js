require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const QRCode = require('qrcode');
const domain = require('./domain');
const storage = require('./storage');
const fabric = require('./fabric');
const auth = require('./auth');
const { eventHash } = require('./hash');

const app = express();
const uploadDirectory = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDirectory));

app.get('/', (_req, res) => res.json({
  name: 'TraceChain API',
  status: 'ok',
  frontend: 'http://localhost:3000',
  health: '/api/health',
}));

async function hydrateFabricLot(lot) {
  const events = (await fabric.history(lot.lotId)).sort(
    (left, right) => new Date(left.timestamp) - new Date(right.timestamp),
  );
  return {
    ...lot,
    events,
    eventCount: events.length,
    createdAt: events[0]?.timestamp || new Date().toISOString(),
    lastEventId: lot.lastEventId || events.at(-1)?.eventId || null,
  };
}

function verifyHistory(events) {
  let valid = true;
  const brokenLinks = [];
  const invalidHashes = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedPrevious = index === 0 ? (event.previousEventId || '') : events[index - 1].eventId;
    if ((event.previousEventId || '') !== expectedPrevious) {
      valid = false;
      brokenLinks.push(event.eventId);
    }
    const expectedIntegrityHash = event.integrityHash || eventHash({...event, dataHash: ''});
    if (event.integrityHash ? event.integrityHash !== eventHash(event) : event.dataHash !== expectedIntegrityHash) {
      valid = false;
      invalidHashes.push(event.eventId);
    }
  }
  return {valid, checkedEvents: events.length, brokenLinks, invalidHashes};
}

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  mysql: storage.isEnabled() ? 'enabled' : 'disabled',
  fabric: fabric.enabled() ? 'enabled' : 'disabled',
}));
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = auth.getSession(token);
  if (!user) return res.status(401).json({error: 'Authentication required'});
  req.user = user;
  req.sessionToken = token;
  next();
}
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({error: 'Admin permission required'});
  next();
}
function parseChaincodeError(error) {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.step && parsed.code) return parsed;
  } catch {
    // Keep the original error when Fabric returned a non-JSON message.
  }
  return {step: 'System', code: 'REQUEST_FAILED', message: error.message};
}
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({error: 'username and password are required'});
    const user = await storage.authenticateUser(username, password);
    if (!user) return res.status(401).json({error: 'Invalid username or password'});
    res.json({token: auth.createSession(user), user});
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', requireAuth, (req, res) => {
  auth.revokeSession(req.sessionToken);
  res.status(204).end();
});
app.get('/api/users', requireAuth, requireAdmin, async (_req, res, next) => {
  try { res.json((await storage.listUsers()) || []); } catch (error) { next(error); }
});
app.post('/api/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const required = ['username', 'password', 'role'];
    const missing = required.find((field) => typeof req.body[field] !== 'string' || !req.body[field].trim());
    if (missing) return res.status(400).json({error: `${missing} is required`});
    if (!['ADMIN', 'FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'].includes(req.body.role)) {
      return res.status(400).json({error: 'Unsupported role'});
    }
    if (req.body.role !== 'ADMIN' && (!req.body.actorId || !req.body.orgMsp)) {
      return res.status(400).json({error: 'actorId and orgMsp are required for actor users'});
    }
    await storage.saveUser(req.body);
    await storage.saveAudit({actorUsername: req.user.username, action: 'USER_CREATED_OR_UPDATED', target: req.body.username, details: {role: req.body.role}});
    res.status(201).json((await storage.listUsers()).find((user) => user.username === req.body.username));
  } catch (error) { next(error); }
});
app.patch('/api/users/:username/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({error: 'Unsupported account status'});
    if (req.params.username === req.user.username && status === 'INACTIVE') {
      return res.status(400).json({error: 'You cannot deactivate your own account'});
    }
    await storage.setUserStatus(req.params.username, status);
    await storage.saveAudit({actorUsername: req.user.username, action: 'USER_STATUS_CHANGED', target: req.params.username, details: {status}});
    res.json((await storage.listUsers()).find((user) => user.username === req.params.username));
  } catch (error) { next(error); }
});
app.post('/api/users/:username/reset-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (typeof req.body.password !== 'string' || req.body.password.length < 6) {
      return res.status(400).json({error: 'password must contain at least 6 characters'});
    }
    await storage.resetUserPassword(req.params.username, req.body.password);
    await storage.saveAudit({actorUsername: req.user.username, action: 'USER_PASSWORD_RESET', target: req.params.username});
    res.json({message: 'Password reset successfully'});
  } catch (error) { next(error); }
});
app.get('/api/organizations', async (_req, res, next) => {
  try {
    const organizations = await storage.listOrganizations();
    res.json(organizations || []);
  } catch (error) { next(error); }
});
app.get('/api/actors', requireAuth, async (_req, res, next) => {
  try {
    const actors = await storage.listActors();
    res.json(actors || []);
  } catch (error) { next(error); }
});
app.get('/api/admin/audit-log', requireAuth, requireAdmin, async (_req, res, next) => {
  try { res.json(await storage.listAudit()); } catch (error) { next(error); }
});
app.post('/api/actors', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const requiredFields = ['actorId', 'mspId', 'fabricIdentity', 'fullName', 'actorType'];
    const missing = requiredFields.find((field) => typeof req.body[field] !== 'string' || !req.body[field].trim());
    if (missing) return res.status(400).json({ error: `${missing} is required` });
    if (!Array.isArray(req.body.roles) || req.body.roles.length === 0) {
      return res.status(400).json({ error: 'roles must contain at least one role' });
    }
    await storage.saveActor(req.body);
    const actors = await storage.listActors();
    res.status(201).json(actors.find((actor) => actor.actorId === req.body.actorId));
  } catch (error) { next(error); }
});
app.get('/api/lots', requireAuth, async (req, res, next) => {
  try {
    const regionCode = req.user.role === 'ADMIN' ? null : req.user.regionCode;
    res.json((await storage.listLots(regionCode)) || domain.listLots().filter(lot => req.user.role === 'ADMIN' || lot.regionCode === regionCode));
  } catch (error) { next(error); }
});
app.get('/api/lots/:lotId', requireAuth, async (req, res, next) => {
  try {
    const lot = (await storage.getLot(req.params.lotId)) || domain.getLot(req.params.lotId);
    if (req.user.role !== 'ADMIN' && lot.regionCode !== req.user.regionCode) return res.status(403).json({step: 'Identity', code: 'REGION_DENIED', message: 'Tác nhân không thuộc mã vùng của lô'});
    res.json(lot);
  } catch (error) { next(error); }
});
app.get('/api/public/lots/:lotId', async (req, res, next) => {
  try {
  const lot = (await storage.getLot(req.params.lotId)) || domain.getLot(req.params.lotId);
  res.json({
    lotId: lot.lotId,
    productName: lot.productName,
    origin: lot.origin,
    status: lot.status,
    events: lot.events.map(({actorId, ...event}) => ({...event, actorRole: event.actorRole})),
    integrity: verifyHistory(lot.events),
  });
  } catch (error) { next(error); }
});
app.get('/api/public/trace/:lotId', async (req, res, next) => {
  try {
    const lot = (await storage.getLot(req.params.lotId)) || domain.getLot(req.params.lotId);
    res.json({
      lotId: lot.lotId, productName: lot.productName, origin: lot.origin, status: lot.status,
      events: lot.events.map(({actorId, ...event}) => event),
      integrity: verifyHistory(lot.events),
      notice: 'Dữ liệu được bảo vệ sau khi ghi nhận; blockchain không xác nhận tính đúng của dữ liệu đầu vào.',
    });
  } catch (error) { next(error); }
});
app.get('/api/lots/:lotId/qr', async (req, res, next) => {
  try {
    const target = `${process.env.PUBLIC_BASE_URL || 'http://localhost:3001'}/trace/${encodeURIComponent(req.params.lotId)}`;
    const png = await QRCode.toBuffer(target, {type: 'png', width: 360, margin: 2});
    res.type('png').send(png);
  } catch (error) { next(error); }
});
app.post('/api/documents', requireAuth, upload.single('document'), async (req, res, next) => {
  try {
  if (!req.file) return res.status(400).json({ error: 'document is required' });
  if (!req.body.lotId) return res.status(400).json({ error: 'lotId is required' });
  const fileHash = createHash('sha256').update(req.file.buffer).digest('hex');
  const safeName = `${fileHash}-${path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  fs.writeFileSync(path.join(uploadDirectory, safeName), req.file.buffer);
  await storage.saveDocument({ lotId: req.body.lotId || 'UNASSIGNED', originalName: req.file.originalname, filePath: `/uploads/${safeName}`, fileHash, uploadedBy: req.user.actorId || req.user.username });
  res.status(201).json({ fileName: req.file.originalname, fileHash, path: `/uploads/${safeName}` });
  } catch (error) { next(error); }
});

app.post('/api/lots', requireAuth, async (req, res, next) => {
  try {
  if (!req.user) return res.status(401).json({error: 'Authentication required'});
  if (req.user.role !== 'FARMER') return res.status(403).json({error: 'Only FARMER can create lots'});
  const regionCode = req.body.regionCode || req.user.regionCode;
  if (!regionCode || regionCode === 'GLOBAL') return res.status(400).json({step: 'Identity', code: 'REGION_REQUIRED', message: 'Tác nhân và lô phải có mã vùng cụ thể'});
  const lot = fabric.enabled()
    ? await fabric.submitCreateLot({...req.body, regionCode, actorId: req.user.actorId, actorRole: req.user.role})
    : domain.createLot({...req.body, regionCode, actorId: req.user.actorId, actorRole: req.user.role});
  if (fabric.enabled()) {
    Object.assign(lot, await hydrateFabricLot(lot));
  }
  await storage.saveLot(lot);
  res.status(201).json(lot);
  } catch (error) { next(error); }
});

app.post('/api/lots/:lotId/events', requireAuth, async (req, res, next) => {
  try {
  if (!req.user) return res.status(401).json({error: 'Authentication required'});
  if (req.user.role === 'ADMIN') return res.status(403).json({error: 'Admin cannot record supply-chain events'});
  const payload = {...req.body, actorId: req.user.actorId, actorRole: req.user.role, orgMsp: req.user.orgMsp, actorRegion: req.user.regionCode};
  const lot = fabric.enabled()
    ? await fabric.submitEvent(req.params.lotId, payload)
    : domain.recordEvent(req.params.lotId, payload);
  if (fabric.enabled()) {
    Object.assign(lot, await hydrateFabricLot(lot));
  }
  await storage.saveLot(lot);
  const event = lot.events.at(-1);
  const documentHash = event?.data?.documentHash;
  if (event && documentHash) {
    await storage.attachDocumentsToEvent(req.params.lotId, event.eventId, [documentHash]);
  }
  res.status(201).json(lot);
  } catch (error) { next(error); }
});
async function submitAndStoreEvent(req, res, next, eventInput, fabricSubmit = fabric.submitEvent) {
  try {
    const payload = {...eventInput, actorId: req.user.actorId, actorRole: req.user.role, orgMsp: req.user.orgMsp, actorRegion: req.user.regionCode};
    const lot = fabric.enabled()
      ? await fabricSubmit(req.params.lotId, payload)
      : domain.recordEvent(req.params.lotId, payload);
    if (fabric.enabled()) Object.assign(lot, await hydrateFabricLot(lot));
    await storage.saveLot(lot);
    res.status(201).json(lot);
  } catch (error) { next(error); }
}
app.post('/api/lots/:lotId/handover/request', requireAuth, async (req, res, next) => {
  if (req.user.role !== 'PROCESSOR') return next(Object.assign(new Error('Only PROCESSOR can request handover'), {statusCode: 403}));
  return submitAndStoreEvent(req, res, next, {...req.body, eventType: 'CTE_HANDOVER_SHIP'}, fabric.requestHandover);
});
app.post('/api/lots/:lotId/handover/confirm', requireAuth, async (req, res, next) => {
  if (req.user.role !== 'TRANSPORTER') return next(Object.assign(new Error('Only TRANSPORTER can confirm handover'), {statusCode: 403}));
  return submitAndStoreEvent(req, res, next, {...req.body, eventType: 'CTE_RECEIVE_SHIP'}, fabric.confirmHandover);
});
app.post('/api/lots/:lotId/recall', requireAuth, async (req, res, next) => {
  if (req.user.role === 'ADMIN') return next(Object.assign(new Error('Admin cannot record supply-chain events'), {statusCode: 403}));
  return submitAndStoreEvent(req, res, next, {...req.body, eventType: 'CTE_RECALL'});
});
app.get('/api/lots/:lotId/history', requireAuth, async (req, res, next) => {
  try { res.json((fabric.enabled() ? await fabric.history(req.params.lotId) : (await storage.getLot(req.params.lotId) || domain.getLot(req.params.lotId)).events)); } catch (error) { next(error); }
});
app.get('/api/lots/:lotId/validate', requireAuth, async (req, res, next) => {
  try {
    const result = fabric.enabled() ? await fabric.validateHistory(req.params.lotId) : verifyHistory((await storage.getLot(req.params.lotId) || domain.getLot(req.params.lotId)).events);
    res.json(result);
  } catch (error) { next(error); }
});
app.get('/api/lots/:lotId/verify-documents', requireAuth, async (req, res, next) => {
  try {
    const lot = (await storage.getLot(req.params.lotId)) || domain.getLot(req.params.lotId);
    const documents = await storage.listDocuments(req.params.lotId);
    const results = documents.map((document) => {
      const event = lot.events.find(item => item.eventId === document.eventId);
      return {...document, onChainHash: event?.dataHash || null, valid: !!event && event.dataHash === document.fileHash};
    });
    res.json({valid: results.every(item => item.valid), documents: results});
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  console.error('Request failed:', error);
  const details = parseChaincodeError(error);
  res.status(statusCode).json({step: details.step, code: details.code, message: statusCode === 500 ? 'Internal server error' : details.message, error: details.message});
});

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  storage.connect()
    .then(() => {
      if (fabric.enabled()) fabric.connect();
      return app.listen(port, () => console.log(`Traceability API listening on port ${port}`));
    })
    .catch((error) => { console.error('MySQL connection failed:', error.message); process.exitCode = 1; });
}

module.exports = app;
