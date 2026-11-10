const mysql = require('mysql2/promise');
const {hashPassword, tokenHash} = require('./auth');
const {orderHistory} = require('./integrity');
const policy = require('./authorization');
const {randomUUID} = require('node:crypto');

let pool;

function mysqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

function isEnabled() {
  return process.env.MYSQL_ENABLED === 'true';
}

async function connect() {
  if (!isEnabled()) return false;
  for (const field of ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
    if (!process.env[field]) throw new Error(`${field} is required when MySQL is enabled`);
  }
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: ['DATE'],
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
  });
  try {
    await pool.query('SELECT 1');
    const [[{accounts}]] = await pool.query('SELECT COUNT(*) AS accounts FROM user_accounts');
    if (accounts === 0) {
      const username = process.env.ADMIN_USERNAME;
      const password = process.env.ADMIN_PASSWORD;
      if (!username || !password || password.length < 8) throw new Error('Configure ADMIN_USERNAME and ADMIN_PASSWORD (at least 8 characters) to initialize an empty database');
      await pool.execute("INSERT INTO user_accounts (username, password_hash, role_code) VALUES (?, ?, 'SUPER_ADMIN')", [username, hashPassword(password)]);
      await pool.execute('INSERT INTO application_user_profiles(user_id,username,full_name,region_code) VALUES (?,?,?,?)', [randomUUID(),username,username,'GLOBAL']);
    }
    return true;
  } catch (error) {
    await close();
    throw error;
  }
}

async function authenticateUser(username, password) {
  if (!pool) return null;
  const [rows] = await pool.execute('SELECT password_hash FROM user_accounts WHERE username = ?', [username]);
  if (!rows.length || !require('./auth').verifyPassword(password, rows[0].password_hash)) return null;
  const user = (await listUsers(username))[0];
  if (user?.status !== 'ACTIVE' || user.authorized !== 1) return null;
  await pool.execute('UPDATE user_accounts SET last_login_at=CURRENT_TIMESTAMP(3) WHERE username=?',[username]);
  return user;
}

async function listUsers(username = null) {
  if (!pool) return null;
  const [rows] = await pool.execute(`SELECT u.username,u.actor_id AS actorId,
    IF(u.role_code='ADMIN','SUPER_ADMIN',u.role_code) AS role,u.status,u.created_at AS createdAt,u.last_login_at AS lastLoginAt,
    p.user_id AS userId,p.business_organization_id AS organizationId,p.full_name AS displayName,p.full_name AS fullName,p.email,p.phone,p.updated_at AS updatedAt,p.region_code AS regionCode,
    b.name AS organizationName,b.type AS organizationType,f.msp_id AS orgMsp,
    (p.user_id IS NOT NULL AND (u.role_code IN ('ADMIN','SUPER_ADMIN') OR (u.role_code='BUSINESS_ADMIN' AND b.status='ACTIVE') OR (b.status='ACTIVE' AND b.fabric_organization_id=u.organization_id AND f.status='ACTIVE' AND o.status='ACTIVE' AND a.status='ACTIVE' AND a.organization_id=u.organization_id AND EXISTS(SELECT 1 FROM actor_roles ar WHERE ar.actor_id=u.actor_id AND ar.role_code=u.role_code)))) AS authorized,
    COALESCE((SELECT fi.status FROM fabric_identities fi WHERE fi.user_id=p.user_id ORDER BY fi.created_at DESC,fi.id DESC LIMIT 1),'PENDING') AS fabricIdentityStatus
    FROM user_accounts u LEFT JOIN application_user_profiles p ON p.username=u.username
    LEFT JOIN business_organizations b ON b.id=p.business_organization_id
    LEFT JOIN fabric_organizations f ON f.id=b.fabric_organization_id
    LEFT JOIN organizations o ON o.organization_id=u.organization_id LEFT JOIN actors a ON a.actor_id=u.actor_id
    ${username ? 'WHERE u.username=?' : ''} ORDER BY u.created_at DESC`, username ? [username] : []);
  const [grants] = await pool.query('SELECT role_code,permission_code FROM role_permissions');
  const [mappings] = await pool.execute(`SELECT m.user_id,m.actor_id FROM user_actor_mappings m JOIN application_user_profiles p ON p.user_id=m.user_id ${username ? 'WHERE p.username=?' : ''} ORDER BY m.actor_id`, username ? [username] : []);
  for (const row of rows) {
    row.permissions = grants.filter(grant => grant.role_code === row.role).map(grant => grant.permission_code);
    row.legacyActorIds = mappings.filter(mapping => mapping.user_id === row.userId && mapping.actor_id !== row.userId).map(mapping => mapping.actor_id);
  }
  return rows;
}

async function saveUser(input) {
  if (!pool) return;
  const user = {...input, role: policy.normalizeRole(input.role)};
  user.username = textField(user.username,'username',80);
  if (user.fullName != null) user.fullName = textField(user.fullName,'fullName',255);
  user.email = textField(user.email,'email',255,true);
  if (user.phone != null) user.phone = textField(user.phone,'phone',40,true);
  if (user.password != null && typeof user.password !== 'string') throw Object.assign(new Error('password must be text'), {statusCode: 400});
  if (!policy.roles.includes(user.role)) throw Object.assign(new Error('Unsupported role'), {statusCode: 400});
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute('SELECT u.actor_id,p.user_id,p.business_organization_id,u.role_code,p.region_code,p.phone FROM user_accounts u LEFT JOIN application_user_profiles p ON p.username=u.username WHERE u.username=? FOR UPDATE', [user.username]);
    const userId = existing[0]?.user_id || randomUUID();
    if (input.auditActor && !policy.canManageUser(input.auditActor,{username:user.username,role:existing[0] ? policy.normalizeRole(existing[0].role_code) : user.role,organizationId:existing[0]?.business_organization_id || user.organizationId})) throw Object.assign(new Error('Không có quyền quản lý tài khoản này'),{statusCode:403});
    if (input.invitation && existing.length) throw Object.assign(new Error('Username already exists'),{statusCode:409});
    // Save the old alias before an update switches the account to its per-user actor row.
    if (existing[0]?.user_id && existing[0]?.actor_id) await connection.execute('INSERT INTO user_actor_mappings(user_id,actor_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=user_actor_mappings.user_id', [userId,existing[0].actor_id]);
    let business, legacyActor;
    if (user.role !== 'SUPER_ADMIN') {
      if (user.organizationId) {
        const [rows] = await connection.execute("SELECT b.*,f.msp_id AS mspId FROM business_organizations b JOIN fabric_organizations f ON f.id=b.fabric_organization_id WHERE b.id=? AND b.status='ACTIVE' AND f.status='ACTIVE'", [user.organizationId]);
        business = rows[0];
        if (!business || (user.role !== 'BUSINESS_ADMIN' && policy.organizationTypes[business.type]?.role !== user.role)) throw Object.assign(new Error('Business organization type/MSP does not match user role'), {statusCode: 400});
      } else {
        // Preserve direct legacy storage callers; HTTP user creation always requires a business organization.
        const [actors] = await connection.execute("SELECT a.*,o.msp_id AS mspId FROM actors a JOIN organizations o ON o.organization_id=a.organization_id JOIN actor_roles ar ON ar.actor_id=a.actor_id WHERE a.actor_id=? AND ar.role_code=? AND a.status='ACTIVE' AND o.status='ACTIVE'", [user.actorId, user.role]);
        legacyActor = actors[0];
        if (!legacyActor || legacyActor.mspId !== user.orgMsp) throw Object.assign(new Error('Actor does not belong to selected MSP/role'), {statusCode: 400});
        const code = `LEGACY-${require('node:crypto').createHash('sha256').update(user.actorId + ':' + user.role).digest('hex').slice(0,32)}`;
        const type = Object.keys(policy.organizationTypes).find(type => policy.organizationTypes[type].role === user.role);
        await connection.execute('INSERT INTO business_organizations(id,code,name,type,fabric_organization_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=business_organizations.id', [randomUUID(),code,legacyActor.full_name,type,legacyActor.organization_id]);
        const [rows] = await connection.execute('SELECT * FROM business_organizations WHERE code=?', [code]); business = rows[0];
      }
    }
    const region = user.role === 'SUPER_ADMIN' ? 'GLOBAL' : user.regionCode || legacyActor?.region_code || existing[0]?.region_code;
    if (user.role !== 'SUPER_ADMIN' && (typeof region !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(region))) throw Object.assign(new Error('regionCode is required'), {statusCode: 400});
    const actorId = ['SUPER_ADMIN','BUSINESS_ADMIN'].includes(user.role) ? null : (user.organizationId ? userId : existing[0]?.actor_id || legacyActor?.actor_id || userId);
    if (actorId && !legacyActor) {
      await connection.execute(`INSERT INTO actors(actor_id,organization_id,fabric_identity,full_name,email,actor_type,region_code) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE organization_id=VALUES(organization_id),full_name=VALUES(full_name),email=VALUES(email),actor_type=VALUES(actor_type),region_code=VALUES(region_code)`, [actorId,business.fabric_organization_id,`application-user:${userId}`,user.fullName || user.username,user.email || null,user.role,region]);
      await connection.execute('DELETE FROM actor_roles WHERE actor_id=?', [actorId]);
      await connection.execute('INSERT INTO actor_roles(actor_id,role_code) VALUES (?,?)', [actorId,user.role]);
    }
    if (!existing.length) {
      if (typeof user.password !== 'string' || user.password.length < 8) throw Object.assign(new Error('password must contain at least 8 characters'), {statusCode: 400});
      await connection.execute('INSERT INTO user_accounts(username,password_hash,actor_id,role_code,organization_id) VALUES (?,?,?,?,?)', [user.username,hashPassword(user.password),actorId,user.role,business?.fabric_organization_id || null]);
    } else {
      await connection.execute('UPDATE user_accounts SET actor_id=?,role_code=?,organization_id=? WHERE username=?', [actorId,user.role,business?.fabric_organization_id || null,user.username]);
      if (user.password) {
        if (user.password.length < 8) throw Object.assign(new Error('password must contain at least 8 characters'), {statusCode: 400});
        await connection.execute('UPDATE user_accounts SET password_hash=? WHERE username=?', [hashPassword(user.password),user.username]);
      }
    }
    await connection.execute('INSERT INTO application_user_profiles(user_id,username,business_organization_id,full_name,email,phone,region_code) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE business_organization_id=VALUES(business_organization_id),full_name=VALUES(full_name),email=VALUES(email),phone=VALUES(phone),region_code=VALUES(region_code)', [userId,user.username,business?.id || null,user.fullName || legacyActor?.full_name || user.username,user.email || null,user.phone === undefined ? existing[0]?.phone ?? legacyActor?.phone ?? null : user.phone || null,region]);
    if (actorId) await connection.execute('INSERT INTO user_actor_mappings(user_id,actor_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=user_actor_mappings.user_id', [userId,actorId]);
    if (existing.length && (policy.normalizeRole(existing[0].role_code) !== user.role || existing[0].business_organization_id !== (business?.id || null) || existing[0].region_code !== region)) await connection.execute("UPDATE fabric_identities SET status='DISABLED' WHERE user_id=? AND status='ACTIVE'", [userId]);
    if (input.invitation) {
      await connection.execute("UPDATE user_accounts SET status='PENDING_ACTIVATION' WHERE username=?",[user.username]);
      await connection.execute('INSERT INTO account_invitations(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)',[randomUUID(),userId,tokenHash(input.invitation.token),mysqlDate(input.invitation.expiresAt)]);
    }
    if (input.auditActor) await insertIdentityAudit(connection,input.auditActor,existing.length ? 'USER_UPDATED' : 'USER_CREATED','user',userId,{role: user.role,organizationId: business?.id || null});
    await connection.commit();
  } catch (error) {await connection.rollback();throw error;} finally {connection.release();}
}

async function updateAccount(username, operation, value, actor) {
  if (!pool) return;
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [found]=await connection.execute('SELECT u.username,u.role_code AS role,u.status,p.business_organization_id AS organizationId FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username WHERE u.username=? FOR UPDATE',[username]);
    if (!found.length) throw Object.assign(new Error('User account was not found'),{statusCode:404});
    if (actor && actor.username !== found[0].username && !policy.canManageUser(actor,found[0])) throw Object.assign(new Error('Không có quyền quản lý tài khoản này'),{statusCode:403});
    if (operation==='status' && found[0].status==='PENDING_ACTIVATION' && value==='ACTIVE') throw Object.assign(new Error('Tài khoản phải kích hoạt bằng lời mời'),{statusCode:409});
    if(operation==='status' && value==='ACTIVE') {
      const [pending]=await connection.execute('SELECT 1 FROM account_invitations i JOIN application_user_profiles p ON p.user_id=i.user_id WHERE p.username=? AND i.used_at IS NULL LIMIT 1',[username]);
      if(pending.length) value='PENDING_ACTIVATION';
    }
    if (operation==='status') await connection.execute('UPDATE user_accounts SET status=? WHERE username=?',[value,username]);
    else await connection.execute('UPDATE user_accounts SET password_hash=? WHERE username=?',[hashPassword(value),username]);
    await connection.execute('UPDATE application_user_profiles SET updated_at=CURRENT_TIMESTAMP(3) WHERE username=?',[username]);
    if(actor) await insertIdentityAudit(connection,actor,operation==='status'?'USER_STATUS_CHANGED':'USER_PASSWORD_CHANGED','user',username,operation==='status'?{status:value}:{});
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function setUserStatus(username,status,actor) {return updateAccount(username,'status',status,actor);}
async function resetUserPassword(username,password,actor) {return updateAccount(username,'password',password,actor);}

async function listOrganizations() {
  if (!pool) return null;
  const [rows] = await pool.query(
    `SELECT organization_id AS organizationId, msp_id AS mspId, name,
      organization_type AS organizationType, address, status, created_at AS createdAt
     FROM organizations ORDER BY organization_id`,
  );
  return rows;
}

async function listActors() {
  if (!pool) return null;
  const [rows] = await pool.query(
    `SELECT a.actor_id AS actorId, a.fabric_identity AS fabricIdentity, a.full_name AS fullName,
      a.email, a.phone, a.actor_type AS actorType, a.region_code AS regionCode, a.status,
      o.organization_id AS organizationId, o.msp_id AS mspId, o.name AS organizationName,
      GROUP_CONCAT(ar.role_code ORDER BY ar.role_code SEPARATOR ',') AS roles
     FROM actors a
     JOIN organizations o ON o.organization_id = a.organization_id
     LEFT JOIN actor_roles ar ON ar.actor_id = a.actor_id
     GROUP BY a.actor_id ORDER BY a.created_at DESC`,
  );
  return rows.map((row) => ({ ...row, roles: row.roles ? row.roles.split(',') : [] }));
}

async function saveActor(actor) {
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [organizations] = await connection.execute(
      'SELECT organization_id FROM organizations WHERE msp_id = ? AND status = "ACTIVE"',
      [actor.mspId],
    );
    if (organizations.length === 0) throw Object.assign(new Error(`Unknown active organization MSP: ${actor.mspId}`), {statusCode: 400});
    const [current] = await connection.execute('SELECT organization_id, region_code, fabric_identity FROM actors WHERE actor_id = ? FOR UPDATE', [actor.actorId]);
    if (current.length && (Number(current[0].organization_id) !== Number(organizations[0].organization_id) || current[0].region_code !== (actor.regionCode || 'GLOBAL') || current[0].fabric_identity !== actor.fabricIdentity)) {
      const [[{used}]] = await connection.execute('SELECT (SELECT COUNT(*) FROM user_accounts WHERE actor_id = ?) + (SELECT COUNT(*) FROM trace_events WHERE actor_id = ?) AS used', [actor.actorId, actor.actorId]);
      if (used) throw Object.assign(new Error('Actor identity, organization and region are immutable once linked; create a new actor'), {statusCode: 409});
    }
    await connection.execute(
      `INSERT INTO actors (actor_id, organization_id, fabric_identity, full_name, email, phone, actor_type, region_code, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
       ON DUPLICATE KEY UPDATE organization_id=VALUES(organization_id), fabric_identity=VALUES(fabric_identity),
       full_name=VALUES(full_name), email=VALUES(email), phone=VALUES(phone), actor_type=VALUES(actor_type), region_code=VALUES(region_code)`,
      [actor.actorId, organizations[0].organization_id, actor.fabricIdentity, actor.fullName,
        actor.email || null, actor.phone || null, actor.actorType, actor.regionCode || 'GLOBAL'],
    );
    await connection.execute('DELETE FROM actor_roles WHERE actor_id = ?', [actor.actorId]);
    for (const role of actor.roles || []) {
      await connection.execute('INSERT INTO actor_roles (actor_id, role_code) VALUES (?, ?)', [actor.actorId, role]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveLot(lot, expectedPrevious, audit) {
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [heads] = await connection.execute('SELECT last_event_id AS lastEventId FROM lots WHERE lot_id = ? FOR UPDATE', [lot.lotId]);
    if (expectedPrevious !== undefined && ((heads[0]?.lastEventId || null) !== (expectedPrevious || null) || (expectedPrevious === null && heads.length))) {
      throw Object.assign(new Error('Lot changed; reload the latest history'), {statusCode: 409});
    }

    await connection.execute(
      `INSERT INTO lots (lot_id, product_name, origin, harvest_date, status, current_holder, created_at, last_event_id, region_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE product_name=VALUES(product_name), origin=VALUES(origin),
       harvest_date=VALUES(harvest_date), status=VALUES(status), current_holder=VALUES(current_holder),
       last_event_id=VALUES(last_event_id), region_code=VALUES(region_code)`,
      [lot.lotId, lot.productName, lot.origin, lot.harvestDate, lot.status, lot.currentHolder, mysqlDate(lot.createdAt), lot.lastEventId, lot.regionCode || 'GLOBAL'],
    );
    const [storedEvents] = await connection.execute(
      'SELECT event_id AS eventId, data_hash AS dataHash, integrity_hash AS integrityHash FROM trace_events WHERE lot_id = ?', [lot.lotId],
    );
    const existing = new Map(storedEvents.map(event => [event.eventId, event]));
    for (const event of lot.events) {
      const saved = existing.get(event.eventId);
      if (saved) {
        if (saved.dataHash !== event.dataHash || saved.integrityHash !== (event.integrityHash || null)) {
          throw Object.assign(new Error('Stored event hashes cannot be overwritten'), {statusCode: 409});
        }
        continue;
      }
      await connection.execute(
        `INSERT INTO trace_events
        (event_id, lot_id, event_type, event_timestamp, location, actor_id, actor_role, actor_region, previous_event_id, data_json, data_hash, integrity_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.eventId, lot.lotId, event.eventType, mysqlDate(event.timestamp), event.location, event.actorId, event.actorRole,
          event.actorRegion || lot.regionCode || 'GLOBAL', event.previousEventId, JSON.stringify(event.data), event.dataHash, event.integrityHash || null, mysqlDate(new Date())],
      );
    }
    if (lot.ownerOrganizationId) await connection.execute('INSERT INTO lot_business_scopes(lot_id,owner_organization_id,processor_organization_id,distributor_organization_id,current_holder_organization_id,pending_to_organization_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE current_holder_organization_id=VALUES(current_holder_organization_id),pending_to_organization_id=VALUES(pending_to_organization_id)', [lot.lotId,lot.ownerOrganizationId,lot.processorOrganizationId,lot.distributorOrganizationId,lot.currentHolderOrganizationId,lot.pendingToOrganizationId || null]);
    if (lot.schemaVersion === 4 && lot.source !== 'FABRIC') await connection.execute('INSERT INTO local_projections(lot_id,projection_json) VALUES (?,?) ON DUPLICATE KEY UPDATE projection_json=VALUES(projection_json)',[lot.lotId,JSON.stringify(lot)]);
    if (lot.source === 'FABRIC') await connection.execute('INSERT INTO fabric_projections (lot_id,channel_name,chaincode_name,projection_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE projection_json=VALUES(projection_json)', [lot.lotId, process.env.FABRIC_CHANNEL || 'tracechannel-v2', process.env.FABRIC_CHAINCODE || 'traceability_v2', JSON.stringify(lot)]);
    const latest = lot.events.at(-1);
    for (const anchored of expectedPrevious === undefined ? [] : lot.events.filter(event=>event.data?.documentHash)) {

      const [documents] = await connection.execute('SELECT document_id FROM event_documents WHERE lot_id = ? AND file_hash = ? AND (event_id IS NULL OR event_id = ?) FOR UPDATE', [lot.lotId, anchored.data.documentHash, anchored.eventId]);
      if (!documents.length) throw Object.assign(new Error('Document hash is not an available document of this lot'), {statusCode: 400});
      await connection.execute('UPDATE event_documents SET event_id = ? WHERE lot_id = ? AND file_hash = ? AND event_id IS NULL', [anchored.eventId, lot.lotId, anchored.data.documentHash]);
    }
    if (audit) await insertIdentityAudit(connection,audit,audit.action,'lot',lot.lotId,{eventId: latest?.eventId});
    if (audit) await connection.execute('INSERT INTO audit_log (actor_username, action_code, target_ref, details_json) VALUES (?, ?, ?, ?)', [audit.actorUsername, audit.action, lot.lotId, JSON.stringify({eventId: latest?.eventId})]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listLots(regionCode = null) {
  if (!pool) return null;
  const [rows] = await pool.query(
    `SELECT lot_id AS lotId, product_name AS productName, origin, harvest_date AS harvestDate,
      status, current_holder AS currentHolder, region_code AS regionCode, created_at AS createdAt,
      last_event_id AS lastEventId, IF(EXISTS(SELECT 1 FROM fabric_projections fp WHERE fp.lot_id = l.lot_id), 'FABRIC', 'LOCAL') AS source, (SELECT COUNT(*) FROM trace_events e WHERE e.lot_id = l.lot_id) AS eventCount
     FROM lots l ${regionCode ? 'WHERE region_code = ?' : ''} ORDER BY created_at DESC`,
    regionCode ? [regionCode] : [],
  );
  const [scopes] = await pool.query('SELECT lot_id AS lotId,owner_organization_id AS ownerOrganizationId,processor_organization_id AS processorOrganizationId,distributor_organization_id AS distributorOrganizationId,current_holder_organization_id AS currentHolderOrganizationId,pending_to_organization_id AS pendingToOrganizationId FROM lot_business_scopes');
  const [local] = await pool.query('SELECT lot_id,projection_json FROM local_projections');
  return rows.map(row => ({...row,...scopes.find(scope => scope.lotId === row.lotId),...local.find(item=>item.lot_id===row.lotId)?.projection_json}));
}

async function getLot(lotId) {
  if (!pool) return null;
  const [lotRows] = await pool.execute(
    'SELECT lot_id AS lotId, product_name AS productName, origin, harvest_date AS harvestDate, status, current_holder AS currentHolder, region_code AS regionCode, created_at AS createdAt, last_event_id AS lastEventId FROM lots WHERE lot_id = ?',
    [lotId],
  );
  if (lotRows.length === 0) return null;
  const [eventRows] = await pool.execute(
    'SELECT event_id AS eventId, lot_id AS lotId, event_type AS eventType, event_timestamp AS timestamp, location, actor_id AS actorId, actor_role AS actorRole, actor_region AS actorRegion, previous_event_id AS previousEventId, data_json AS data, data_hash AS dataHash, integrity_hash AS integrityHash FROM trace_events WHERE lot_id = ? ORDER BY event_timestamp ASC, created_at ASC',
    [lotId],
  );
  const [projections] = await pool.execute('SELECT projection_json AS projection FROM fabric_projections WHERE lot_id = ?', [lotId]);
  if (projections.length) return {...projections[0].projection, source: 'FABRIC'};
  const [local] = await pool.execute('SELECT projection_json AS projection FROM local_projections WHERE lot_id=?',[lotId]);
  if (local.length) return {...local[0].projection,source:'LOCAL'};
  const events = orderHistory(eventRows, lotRows[0].lastEventId);
  for (const event of events) event.timestamp = event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp;
  const handover = [...events].reverse().find(event => ['CTE_HANDOVER_SHIP', 'CTE_RECEIVE_SHIP'].includes(event.eventType));
  const [scopes] = await pool.execute('SELECT owner_organization_id AS ownerOrganizationId,processor_organization_id AS processorOrganizationId,distributor_organization_id AS distributorOrganizationId,current_holder_organization_id AS currentHolderOrganizationId,pending_to_organization_id AS pendingToOrganizationId FROM lot_business_scopes WHERE lot_id=?', [lotRows[0].lotId]);
  return {...lotRows[0],...scopes[0], pendingFromOrganizationId: handover?.eventType === 'CTE_HANDOVER_SHIP' ? scopes[0]?.processorOrganizationId : '', source: 'LOCAL', events, eventCount: events.length,
    pendingTo: handover?.eventType === 'CTE_HANDOVER_SHIP' ? handover.data.toOrg : '',
    pendingToRegion: handover?.eventType === 'CTE_HANDOVER_SHIP' ? handover.data.toRegion : ''};
}

async function saveDocument(document) {
  if (!pool) return;
  await pool.execute(
    `INSERT INTO event_documents (event_id, lot_id, original_name, file_path, file_hash, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [document.eventId || null, document.lotId, document.originalName, document.filePath, document.fileHash, document.uploadedBy, new Date()],
  );
}

async function attachDocumentsToEvent(lotId, eventId, fileHashes) {
  if (!pool || !Array.isArray(fileHashes) || fileHashes.length === 0) return;
  const hashes = fileHashes.filter((hash) => typeof hash === 'string' && hash.trim());
  if (hashes.length === 0) return;
  for (const hash of hashes) {
    await pool.execute(
      'UPDATE event_documents SET event_id = ? WHERE lot_id = ? AND file_hash = ? AND event_id IS NULL',
      [eventId, lotId, hash],
    );
  }
}

async function listDocuments(lotId) {
  if (!pool) return [];
  const [rows] = await pool.execute(
    `SELECT document_id AS documentId, event_id AS eventId, lot_id AS lotId,
      original_name AS originalName, file_path AS filePath, file_hash AS fileHash,
      uploaded_by AS uploadedBy, created_at AS createdAt
     FROM event_documents WHERE lot_id = ? ORDER BY created_at`,
    [lotId],
  );
  return rows;
}

async function saveAudit(entry) {
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT INTO audit_log (actor_username,action_code,target_ref,details_json) VALUES (?,?,?,?)',[entry.actorUsername,entry.action,entry.target || null,JSON.stringify(entry.details || {})]);
    if (entry.userId && entry.action !== 'USER_CREATED_OR_UPDATED') await insertIdentityAudit(connection,entry,entry.action,'account',entry.target || null,entry.details || {});
    await connection.commit();
  } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
}

async function listAudit() {
  if (!pool) return [];
  const [rows] = await pool.query(
    `SELECT audit_id AS auditId, actor_username AS actorUsername, action_code AS action,
      target_ref AS target, details_json AS details, created_at AS createdAt
     FROM audit_log ORDER BY created_at DESC LIMIT 500`,
  );
  return rows;
}

async function listRecords(lotId, type, page = 1, size = 20) {
  if (!pool) return {items: [], total: 0, page, size};
  const [[{total}]] = await pool.execute('SELECT COUNT(*) AS total FROM lot_records WHERE lot_id = ? AND record_type = ?', [lotId, type]);
  const [items] = await pool.query('SELECT record_id AS id, lot_id AS lotId, record_type AS type, occurred_at AS occurredAt, data_json AS data, created_by AS createdBy, created_at AS createdAt FROM lot_records WHERE lot_id = ? AND record_type = ? ORDER BY occurred_at DESC, record_id LIMIT ? OFFSET ?', [lotId, type, size, (page - 1) * size]);
  return {items, total, page, size};
}
async function saveRecord(lotId, type, record, user) {
  const username = typeof user === 'string' ? user : user.username;
  if (!pool) throw Object.assign(new Error('MySQL is required for business records'), {statusCode: 503});
  const id = require('node:crypto').randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT INTO lot_records (record_id, lot_id, record_type, occurred_at, data_json, created_by) VALUES (?,?,?,?,?,?)', [id, lotId, type, mysqlDate(record.occurredAt), JSON.stringify(record.data), username]);
    await connection.execute('INSERT INTO audit_log (actor_username,action_code,target_ref,details_json) VALUES (?,?,?,?)', [username, 'RECORD_CREATED', lotId, JSON.stringify({id, type})]);
    if (typeof user === 'object') await insertIdentityAudit(connection,user,'RECORD_CREATED','lot',lotId,{id,type});
    await connection.commit();
    return {id, lotId, type, ...record, createdBy: username, source: 'OFF_CHAIN'};
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function compareLedger(lot) {
  const anomalies = [];
  if (!pool) return [{step: 'Data Integrity', code: 'MYSQL_UNAVAILABLE', message: 'No SQL projection'}];
  const [heads] = await pool.execute('SELECT last_event_id,status,region_code,current_holder,product_name,origin,harvest_date FROM lots WHERE lot_id = ?', [lot.lotId]);
  const head = heads[0];
  if (!head || head.last_event_id !== lot.lastEventId || head.status !== lot.status || head.region_code !== lot.regionCode || head.current_holder !== lot.currentHolder || head.product_name !== lot.productName || head.origin !== lot.origin || head.harvest_date !== lot.harvestDate) anomalies.push({step: 'Data Integrity', code: 'MYSQL_LOT', message: 'MySQL lot metadata differs from ledger'});
  const [scopes] = await pool.execute('SELECT owner_organization_id AS ownerOrganizationId,processor_organization_id AS processorOrganizationId,distributor_organization_id AS distributorOrganizationId,current_holder_organization_id AS currentHolderOrganizationId,pending_to_organization_id AS pendingToOrganizationId FROM lot_business_scopes WHERE lot_id=?', [lot.lotId]);
  if (!scopes.length || Object.keys(scopes[0]).some(key => (scopes[0][key] || '') !== (lot[key] || ''))) anomalies.push({step: 'Data Integrity', code: 'MYSQL_SCOPE', message: 'MySQL business ownership or custody differs from ledger'});
  const [projections] = await pool.execute('SELECT projection_json AS projection FROM fabric_projections WHERE lot_id=?', [lot.lotId]);
  const projection = projections[0]?.projection;
  if (!projection || Object.keys(lot).filter(key => key !== 'source').some(key => !require('node:util').isDeepStrictEqual(projection[key], lot[key]))) anomalies.push({step: 'Data Integrity', code: 'MYSQL_PROJECTION', message: 'MySQL ledger projection differs from ledger'});
  const [rows] = await pool.execute('SELECT event_id,event_type,event_timestamp,location,actor_id,actor_role,actor_region,previous_event_id,data_json,data_hash,integrity_hash FROM trace_events WHERE lot_id = ?', [lot.lotId]);
  const byId = new Map(rows.map(row => [row.event_id, row]));
  if (rows.length !== lot.events.length) anomalies.push({step: 'Data Integrity', code: 'MYSQL_EVENT_COUNT', message: 'MySQL event count differs from ledger'});
  for (const event of lot.events) {
    const row = byId.get(event.eventId);
    if (!row || row.event_type !== event.eventType || row.event_timestamp.toISOString() !== event.timestamp || row.location !== event.location || row.actor_id !== event.actorId || row.actor_role !== event.actorRole || row.actor_region !== event.actorRegion || (row.previous_event_id || '') !== (event.previousEventId || '') || row.data_hash !== event.dataHash || row.integrity_hash !== event.integrityHash || !require('node:util').isDeepStrictEqual(row.data_json, event.data)) anomalies.push({step: 'Data Integrity', code: 'MYSQL_EVENT', eventId: event.eventId, message: 'MySQL event differs from ledger'});
  }
  return anomalies;
}

async function listFabricOrganizations() {
  if (!pool) return [];
  const [rows] = await pool.query('SELECT f.id,f.msp_id AS mspId,f.name,f.status,(SELECT COUNT(*) FROM business_organizations b WHERE b.fabric_organization_id=f.id) AS businessCount FROM fabric_organizations f ORDER BY f.id');
  return rows;
}
async function listBusinessOrganizations() {
  if (!pool) return [];
  const [rows] = await pool.query('SELECT b.id AS organizationId,b.code,b.name,b.type,b.type AS organizationType,b.status,b.address,b.email,b.phone,b.created_at AS createdAt,b.updated_at AS updatedAt,f.id AS fabricOrganizationId,f.msp_id AS mspId,(SELECT COUNT(*) FROM application_user_profiles p WHERE p.business_organization_id=b.id) AS userCount FROM business_organizations b JOIN fabric_organizations f ON f.id=b.fabric_organization_id ORDER BY b.created_at,b.code');
  return rows;
}
function textField(value, name, limit, optional = false) {
  if (optional && (value == null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) throw Object.assign(new Error(`${name} must contain 1..${limit} characters`), {statusCode: 400});
  return value.trim();
}
async function insertIdentityAudit(connection, user, action, type, id, details = {}, result = 'SUCCESS') {
  await connection.execute('INSERT INTO identity_audit_logs(actor_user_id,actor_organization_id,action,resource_type,resource_id,result,details) VALUES (?,?,?,?,?,?,?)', [user?.userId || null,user?.organizationId || null,action,type,id,result,JSON.stringify(details)]);
}
async function saveBusinessOrganization(input, id, actor) {
  const updating = !!id;
  const code = textField(input.code,'code',80), name = textField(input.name,'name',255);
  const rule = policy.organizationTypes[input.type];
  if (!rule || input.mspId !== rule.msp || !['ACTIVE','INACTIVE'].includes(input.status || 'ACTIVE')) throw Object.assign(new Error('Organization type, MSP or status is invalid'), {statusCode: 400});
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [fabric] = await connection.execute("SELECT id FROM fabric_organizations WHERE msp_id=? AND status='ACTIVE'", [input.mspId]);
    if (!fabric.length) throw Object.assign(new Error('Fabric MSP is not active'), {statusCode: 400});
    if (id) {
      const [existing] = await connection.execute('SELECT * FROM business_organizations WHERE id=? FOR UPDATE', [id]);
      if (!existing.length) throw Object.assign(new Error('Organization not found'), {statusCode: 404});
      if (Number(existing[0].fabric_organization_id) !== Number(fabric[0].id) || existing[0].type !== input.type) {
        const [[{users}]] = await connection.execute('SELECT COUNT(*) AS users FROM application_user_profiles WHERE business_organization_id=?', [id]);
        if (users) throw Object.assign(new Error('Cannot change type/MSP of an organization with users'), {statusCode: 409});
      }
    } else id = randomUUID();
    const values = [code,name,input.type,fabric[0].id,input.status || 'ACTIVE',textField(input.address,'address',500,true),textField(input.email,'email',255,true),textField(input.phone,'phone',40,true)];
    if (updating) await connection.execute('UPDATE business_organizations SET code=?,name=?,type=?,fabric_organization_id=?,status=?,address=?,email=?,phone=? WHERE id=?', [...values,id]);
    else await connection.execute('INSERT INTO business_organizations(code,name,type,fabric_organization_id,status,address,email,phone,id) VALUES (?,?,?,?,?,?,?,?,?)', [...values,id]);

    await insertIdentityAudit(connection,actor,'ORGANIZATION_SAVED','organization',id,{status: input.status || 'ACTIVE'});
    await connection.commit();
    return (await listBusinessOrganizations()).find(org => org.organizationId === id);
  } catch (error) {await connection.rollback();throw error;} finally {connection.release();}
}
async function listRolePermissions() {
  const [roles] = await pool.query('SELECT * FROM roles ORDER BY code');
  const [permissions] = await pool.query('SELECT * FROM permissions ORDER BY code');
  const [grants] = await pool.query('SELECT role_code AS role,permission_code AS permission FROM role_permissions ORDER BY role_code,permission_code');
  return {roles,permissions,grants};
}
async function getSigningIdentity(user) {
  if (!pool) throw Object.assign(new Error('MySQL identity mapping required'), {statusCode: 503});
  const current = (await listUsers(user.username))?.[0];
  if (!current || current.status !== 'ACTIVE' || current.authorized !== 1 || current.userId !== user.userId || current.role !== user.role || current.organizationId !== user.organizationId || current.orgMsp !== user.orgMsp || current.regionCode !== user.regionCode || !Object.values(policy.eventPermissions).some(permission=>current.permissions.includes(permission))) throw Object.assign(new Error('Account is no longer authorized to sign'),{statusCode:403});
  const [rows] = await pool.execute("SELECT id,user_id AS userId,msp_id AS mspId,business_organization_id AS organizationId,role_code AS role,enrollment_id AS enrollmentId,certificate_reference AS certificateReference,private_key_reference AS privateKeyReference,certificate_sha256 AS certificateSha256 FROM fabric_identities WHERE user_id=? AND status='ACTIVE' ORDER BY created_at DESC,id DESC", [user.userId]);
  const identity = rows[0];
  if (!identity) throw Object.assign(new Error('Tài khoản chưa có chứng thư Fabric đang hoạt động để ký giao dịch. Liên hệ người vận hành để cấp chứng thư.'), {statusCode:403,step:'Identity',code:'FABRIC_IDENTITY_REQUIRED'});
  if (identity.organizationId !== user.organizationId || identity.mspId !== user.orgMsp || identity.role !== user.role) throw Object.assign(new Error('Chứng thư Fabric không khớp doanh nghiệp hoặc vai trò hiện tại. Liên hệ người vận hành để đối soát và cấp lại.'), {statusCode:403,step:'Identity',code:'FABRIC_IDENTITY_MISMATCH'});
  return identity;
}
async function listIdentityStatuses() {
  const [rows] = await pool.query('SELECT fi.id,fi.user_id AS userId,p.username,fi.business_organization_id AS organizationId,b.name AS organizationName,fi.msp_id AS mspId,fi.role_code AS role,fi.enrollment_id AS enrollmentId,fi.status,fi.certificate_sha256 AS fingerprint,fi.created_at AS createdAt FROM fabric_identities fi JOIN application_user_profiles p ON p.user_id=fi.user_id JOIN business_organizations b ON b.id=fi.business_organization_id ORDER BY fi.created_at DESC');
  return rows;
}
async function listIdentityAudit(user) {
  const [rows] = await pool.execute(`SELECT a.id AS auditId,a.actor_user_id AS userId,p.username AS actorUsername,a.actor_organization_id AS organizationId,b.name AS organizationName,a.action,a.resource_type AS resourceType,a.resource_id AS target,a.result,a.details,a.timestamp AS createdAt FROM identity_audit_logs a LEFT JOIN application_user_profiles p ON p.user_id=a.actor_user_id LEFT JOIN business_organizations b ON b.id=a.actor_organization_id ${user ? 'WHERE a.actor_user_id=?' : ''} ORDER BY a.id DESC LIMIT 500`, user ? [user] : []);
  return rows;
}
async function organizationForEvent(id, type) {
  const [rows] = await pool.execute("SELECT b.id,f.msp_id AS mspId FROM business_organizations b JOIN fabric_organizations f ON f.id=b.fabric_organization_id WHERE b.id=? AND b.type=? AND b.status='ACTIVE' AND f.status='ACTIVE'", [id,type]);
  if (!rows.length) throw Object.assign(new Error('Assigned business organization is not active or has the wrong type'), {statusCode: 400});
  return rows[0];
}

async function saveFailure(user,method,requestPath,status) {
  if (!pool) return;
  await pool.execute('INSERT INTO request_failures(user_id,organization_id,method,path,http_status) VALUES (?,?,?,?,?)',[user.userId,user.organizationId || null,method,requestPath.slice(0,500),status]);
}
async function listFailures() {
  if (!pool) return [];
  const [rows]=await pool.query('SELECT id,user_id AS userId,organization_id AS organizationId,method,path,http_status AS status,created_at AS createdAt FROM request_failures ORDER BY id DESC LIMIT 200');return rows;
}
async function close() {
  if (pool) await pool.end();
  pool = undefined;
}

module.exports = {acceptInvitation, reissueInvitation, manageIdentity, listIdentityRequests, approveIdentityIssuance, operatorProvisioningTarget, failIdentityIssuance, saveProvisionedIdentity, saveFailure,listFailures,
  listFabricOrganizations, listBusinessOrganizations, saveBusinessOrganization, listRolePermissions, getSigningIdentity, listIdentityStatuses, listIdentityAudit, organizationForEvent,
  listRecords, saveRecord, compareLedger, connect, close, saveLot, listLots, getLot, saveDocument, listOrganizations, listActors, saveActor, isEnabled,
  attachDocumentsToEvent, listDocuments, saveAudit, listAudit,
  authenticateUser, listUsers, saveUser, setUserStatus, resetUserPassword,
};

async function acceptInvitation(token, password) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute("SELECT i.id,i.user_id,p.username FROM account_invitations i JOIN application_user_profiles p ON p.user_id=i.user_id JOIN user_accounts u ON u.username=p.username LEFT JOIN business_organizations b ON b.id=p.business_organization_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.expires_at>CURRENT_TIMESTAMP(3) AND u.status='PENDING_ACTIVATION' AND b.status='ACTIVE' FOR UPDATE",[tokenHash(token)]);
    if (!rows.length) throw Object.assign(new Error('Lời mời không hợp lệ hoặc đã hết hạn'),{statusCode:400});
    const invitation=rows[0];
    await connection.execute("UPDATE user_accounts SET password_hash=?,status='ACTIVE' WHERE username=?",[hashPassword(password),invitation.username]);
    await connection.execute('UPDATE account_invitations SET used_at=CURRENT_TIMESTAMP(3) WHERE user_id=? AND used_at IS NULL',[invitation.user_id]);
    await insertIdentityAudit(connection,{userId:invitation.user_id},'ACCOUNT_ACTIVATED','user',invitation.user_id);
    await connection.commit();
  } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
}
async function reissueInvitation(username, invitation, actor) {
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT u.username,u.role_code AS role,u.status,p.user_id AS userId,p.business_organization_id AS organizationId FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username WHERE u.username=? FOR UPDATE',[username]);
    const target=rows[0];
    if (!target || !policy.canManageUser(actor,target)) throw Object.assign(new Error('User not found'),{statusCode:404});
    if(target.status!=='PENDING_ACTIVATION') throw Object.assign(new Error('Chỉ gửi lại lời mời chưa kích hoạt'),{statusCode:409});
    await connection.execute('UPDATE account_invitations SET used_at=CURRENT_TIMESTAMP(3) WHERE user_id=? AND used_at IS NULL',[target.userId]);
    await connection.execute('INSERT INTO account_invitations(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)',[randomUUID(),target.userId,tokenHash(invitation.token),mysqlDate(invitation.expiresAt)]);
    await insertIdentityAudit(connection,actor,'INVITATION_REISSUED','user',target.userId);
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function manageIdentity(username, actor, operation) {
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT u.username,u.role_code AS role,u.status,p.user_id AS userId,p.business_organization_id AS organizationId,b.type,b.status AS businessStatus,f.status AS fabricStatus FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id WHERE u.username=? FOR UPDATE',[username]);
    const target=rows[0];
    if (!target || !(policy.canManageUser(actor,target) || actor.userId===target.userId)) throw Object.assign(new Error('User not found'),{statusCode:404});
    if(operation==='request' && (target.status!=='ACTIVE' || target.businessStatus!=='ACTIVE' || target.fabricStatus!=='ACTIVE' || policy.organizationTypes[target.type]?.role!==target.role)) throw Object.assign(new Error('Tài khoản chưa đủ điều kiện cấp danh tính nghiệp vụ'),{statusCode:409});
    if(operation==='disable') await connection.execute("UPDATE fabric_identities SET status='DISABLED' WHERE user_id=? AND status='ACTIVE'",[target.userId]);
    await connection.execute('INSERT INTO fabric_identity_requests(user_id,requested_by,status) VALUES (?,?,?) ON DUPLICATE KEY UPDATE requested_by=VALUES(requested_by),status=VALUES(status)',[target.userId,actor.userId,operation==='request'?'PENDING':'DISABLED']);
    await insertIdentityAudit(connection,actor,operation==='request'?'FABRIC_IDENTITY_REQUESTED':'FABRIC_SIGNING_DISABLED','user',target.userId);
    await connection.commit();
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}
async function listIdentityRequests() {
  const [rows]=await pool.query('SELECT r.user_id AS userId,p.username,p.business_organization_id AS organizationId,b.name AS organizationName,u.role_code AS role,f.msp_id AS mspId,r.status,r.updated_at AS updatedAt FROM fabric_identity_requests r JOIN application_user_profiles p ON p.user_id=r.user_id JOIN user_accounts u ON u.username=p.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id ORDER BY r.updated_at DESC');return rows;
}

async function approveIdentityIssuance(username, actor) {
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute("SELECT u.username,u.role_code AS role,u.status,p.user_id AS userId,p.business_organization_id AS organizationId,p.region_code AS region,b.type,b.status AS businessStatus,f.status AS fabricStatus,r.status AS requestStatus FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id LEFT JOIN fabric_identity_requests r ON r.user_id=p.user_id WHERE u.username=? FOR UPDATE",[username]);
    const target=rows[0];
    if(!target || !policy.canManageUser(actor,target)) throw Object.assign(new Error('User not found'),{statusCode:404});
    if(!['PENDING','FAILED'].includes(target.requestStatus)) throw Object.assign(new Error('Tài khoản chưa có yêu cầu cấp chứng thư có thể xử lý'),{statusCode:409});
    if(target.status!=='ACTIVE' || target.businessStatus!=='ACTIVE' || target.fabricStatus!=='ACTIVE' || policy.organizationTypes[target.type]?.role!==target.role || target.region==='GLOBAL') throw Object.assign(new Error('Tài khoản không còn đủ điều kiện cấp danh tính nghiệp vụ'),{statusCode:409});
    await connection.execute("UPDATE fabric_identity_requests SET requested_by=?,status='APPROVED' WHERE user_id=?",[actor.userId,target.userId]);
    await insertIdentityAudit(connection,actor,'FABRIC_IDENTITY_APPROVED','user',target.userId,{role:target.role,organizationId:target.organizationId});
    await connection.commit();
  } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
}

async function operatorProvisioningTarget(username) {
  const [rows]=await pool.execute("SELECT u.username,u.role_code AS role,u.status,p.user_id AS userId,p.business_organization_id AS organizationId,p.region_code AS region,b.type,b.status AS businessStatus,f.msp_id AS mspId,f.status AS fabricStatus,r.status AS requestStatus,r.requested_by AS approvedBy,approver.business_organization_id AS approverOrganizationId FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id JOIN fabric_identity_requests r ON r.user_id=p.user_id LEFT JOIN application_user_profiles approver ON approver.user_id=r.requested_by WHERE u.username=?",[username]);
  const target=rows[0];
  if(!target || target.requestStatus!=='APPROVED') throw Object.assign(new Error('Yêu cầu chưa được quản trị viên duyệt'),{statusCode:409});
  if(target.status!=='ACTIVE' || target.businessStatus!=='ACTIVE' || target.fabricStatus!=='ACTIVE' || policy.organizationTypes[target.type]?.role!==target.role || target.region==='GLOBAL') throw Object.assign(new Error('Tài khoản không còn đủ điều kiện cấp danh tính nghiệp vụ'),{statusCode:409});
  return target;
}

async function failIdentityIssuance(userId, message) {
  await pool.execute("UPDATE fabric_identity_requests SET status='FAILED' WHERE user_id=? AND status='APPROVED'",[userId]);
  await pool.execute("INSERT INTO identity_audit_logs(action,resource_type,resource_id,result,details) VALUES ('FABRIC_IDENTITY_ISSUE_FAILED','user',?,'FAILED',?)",[userId,JSON.stringify({message:String(message).slice(0,255)})]);
}

async function saveProvisionedIdentity(target, identity, actor) {
  const connection=await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute("SELECT u.role_code AS role,u.status,p.business_organization_id AS organizationId,p.region_code AS region,b.status AS businessStatus,f.msp_id AS mspId,f.status AS fabricStatus,r.status AS requestStatus FROM application_user_profiles p JOIN user_accounts u ON u.username=p.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id JOIN fabric_identity_requests r ON r.user_id=p.user_id WHERE p.user_id=? FOR UPDATE",[target.userId]);
    const current=rows[0];
    if(!current || current.status!=='ACTIVE' || current.businessStatus!=='ACTIVE' || current.fabricStatus!=='ACTIVE' || current.requestStatus!=='APPROVED' || current.role!==target.role || current.organizationId!==target.organizationId || current.region!==target.region || current.mspId!==target.mspId) throw Object.assign(new Error('Tài khoản thay đổi trong lúc cấp chứng thư; mapping chưa được kích hoạt'),{statusCode:409});
    await connection.execute("UPDATE fabric_identities SET status='DISABLED' WHERE user_id=? AND status='ACTIVE' AND enrollment_id<>?",[target.userId,identity.enrollmentId]);
    const [existing]=await connection.execute('SELECT status FROM fabric_identities WHERE enrollment_id=?',[identity.enrollmentId]);
    if(existing[0]?.status==='REVOKED') throw Object.assign(new Error('Chứng thư đã thu hồi không thể kích hoạt lại'),{statusCode:409});
    await connection.execute("INSERT INTO fabric_identities(id,user_id,msp_id,business_organization_id,role_code,enrollment_id,certificate_reference,private_key_reference,certificate_sha256,status) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE') ON DUPLICATE KEY UPDATE certificate_reference=VALUES(certificate_reference),private_key_reference=VALUES(private_key_reference),certificate_sha256=VALUES(certificate_sha256),status='ACTIVE'",[randomUUID(),target.userId,target.mspId,target.organizationId,target.role,identity.enrollmentId,identity.certificateReference,identity.privateKeyReference,identity.certificateSha256]);
    await connection.execute("UPDATE fabric_identity_requests SET status='ISSUED' WHERE user_id=?",[target.userId]);
    await insertIdentityAudit(connection,actor,'FABRIC_IDENTITY_ISSUED','user',target.userId,{mspId:target.mspId,enrollmentId:identity.enrollmentId});
    await connection.commit();
  } catch(error) {await connection.rollback();throw error;} finally {connection.release();}
}
