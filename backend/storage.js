const mysql = require('mysql2/promise');
const {hashPassword} = require('./auth');
const {eventHash} = require('./hash');

let pool;

function mysqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isEnabled() {
  return process.env.MYSQL_ENABLED === 'true';
}

async function connect() {
  if (!isEnabled()) return false;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'tracechain',
    password: process.env.MYSQL_PASSWORD || 'tracechain_dev',
    database: process.env.MYSQL_DATABASE || 'traceability',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
  });
  await pool.query('SELECT 1');
  await pool.query(`CREATE TABLE IF NOT EXISTS organizations (
    organization_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    msp_id VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    organization_type VARCHAR(40) NOT NULL,
    address VARCHAR(500) NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS actors (
    actor_id VARCHAR(255) PRIMARY KEY,
    organization_id BIGINT UNSIGNED NOT NULL,
    fabric_identity TEXT NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(40) NULL,
    actor_type VARCHAR(40) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_actors_organization_runtime FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
    UNIQUE KEY uq_actors_fabric_identity_runtime (fabric_identity(255))
  )`);
  await addColumnIfMissing('actors', 'region_code', "VARCHAR(80) NOT NULL DEFAULT 'GLOBAL'");
  await pool.query(`CREATE TABLE IF NOT EXISTS user_accounts (
    username VARCHAR(80) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    actor_id VARCHAR(255) NULL,
    role_code VARCHAR(40) NOT NULL,
    organization_id BIGINT UNSIGNED NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_user_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id),
    CONSTRAINT fk_user_organization FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
    INDEX idx_user_actor (actor_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS actor_roles (
    actor_id VARCHAR(255) NOT NULL,
    role_code VARCHAR(40) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (actor_id, role_code),
    CONSTRAINT fk_actor_roles_actor_runtime FOREIGN KEY (actor_id) REFERENCES actors(actor_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    audit_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_username VARCHAR(80) NOT NULL,
    action_code VARCHAR(100) NOT NULL,
    target_ref VARCHAR(255) NULL,
    details_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_audit_created_at (created_at)
  )`);
  await pool.query(
    `INSERT IGNORE INTO organizations (msp_id, name, organization_type) VALUES
    ('Org1MSP', 'Nông hộ và sơ chế', 'FARM_PROCESSOR'),
    ('Org2MSP', 'Đơn vị vận chuyển', 'TRANSPORTER'),
    ('Org3MSP', 'Nhà phân phối', 'DISTRIBUTOR')`,
  );
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  await pool.execute(
    `INSERT IGNORE INTO user_accounts (username, password_hash, role_code)
     VALUES (?, ?, 'ADMIN')`,
    [adminUsername, hashPassword(adminPassword)],
  );
  await pool.query('ALTER TABLE lots MODIFY last_event_id VARCHAR(128) NULL');
  await pool.query('ALTER TABLE lots MODIFY current_holder VARCHAR(255) NOT NULL');
  await pool.query('ALTER TABLE trace_events MODIFY event_id VARCHAR(128) NOT NULL');
  await pool.query('ALTER TABLE trace_events MODIFY previous_event_id VARCHAR(128) NULL');
  await pool.query('ALTER TABLE trace_events MODIFY actor_id VARCHAR(255) NOT NULL');
  await addColumnIfMissing('lots', 'region_code', "VARCHAR(80) NOT NULL DEFAULT 'GLOBAL'");
  await addColumnIfMissing('trace_events', 'actor_region', "VARCHAR(80) NOT NULL DEFAULT 'GLOBAL'");
  const [integrityColumns] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'trace_events' AND column_name = 'integrity_hash'`,
  );
  if (integrityColumns.length === 0) await pool.query('ALTER TABLE trace_events ADD COLUMN integrity_hash CHAR(64) NULL');
  await pool.query(
    `UPDATE lots l JOIN actors a ON a.actor_id = l.current_holder
     SET l.region_code = a.region_code WHERE l.region_code = 'GLOBAL' AND a.region_code <> 'GLOBAL'`,
  );
  await pool.query(
    `UPDATE trace_events e JOIN actors a ON a.actor_id = e.actor_id
     SET e.actor_region = a.region_code WHERE e.actor_region = 'GLOBAL' AND a.region_code <> 'GLOBAL'`,
  );
  await normalizeEventHashes();
  return true;
}

async function addColumnIfMissing(table, column, definition) {
  const [columns] = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  if (columns.length === 0) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function normalizeEventHashes() {
  const [events] = await pool.query(
    `SELECT event_id AS eventId, lot_id AS lotId, event_type AS eventType,
      event_timestamp AS timestamp, location, actor_id AS actorId, actor_role AS actorRole,
    previous_event_id AS previousEventId, data_json AS data, data_hash AS dataHash
     FROM trace_events`,
  );
  for (const event of events) {
    event.dataHash = event.data?.documentHash || event.dataHash;
    if (event.data?.documentHash) {
      await pool.execute(
        'UPDATE event_documents SET event_id = ? WHERE lot_id = ? AND file_hash = ? AND event_id IS NULL',
        [event.eventId, event.lotId, event.data.documentHash],
      );
    }
    await pool.execute(
      'UPDATE trace_events SET data_hash = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(data_json, "$.documentHash")), data_hash), integrity_hash = ? WHERE event_id = ?',
      [eventHash(event), event.eventId],
    );
  }
}

async function authenticateUser(username, password) {
  if (!pool) return null;
  const [rows] = await pool.execute(
    `SELECT u.username, u.password_hash AS passwordHash, u.actor_id AS actorId,
      u.role_code AS role, o.msp_id AS orgMsp, a.region_code AS regionCode, a.full_name AS displayName
     FROM user_accounts u
     LEFT JOIN organizations o ON o.organization_id = u.organization_id
     LEFT JOIN actors a ON a.actor_id = u.actor_id
     WHERE u.username = ? AND u.status = 'ACTIVE'`,
    [username],
  );
  if (rows.length === 0 || !require('./auth').verifyPassword(password, rows[0].passwordHash)) return null;
  const {passwordHash, ...user} = rows[0];
  return user;
}

async function listUsers() {
  if (!pool) return null;
  const [rows] = await pool.query(
    `SELECT u.username, u.actor_id AS actorId, u.role_code AS role, u.status,
      o.msp_id AS orgMsp, a.region_code AS regionCode, a.full_name AS displayName, u.created_at AS createdAt
     FROM user_accounts u
     LEFT JOIN organizations o ON o.organization_id = u.organization_id
     LEFT JOIN actors a ON a.actor_id = u.actor_id
     ORDER BY u.created_at DESC`,
  );
  return rows;
}

async function saveUser(user) {
  if (!pool) return;
  const [organizations] = await pool.execute(
    'SELECT organization_id FROM organizations WHERE msp_id = ? AND status = "ACTIVE"',
    [user.orgMsp || null],
  );
  if (user.role !== 'ADMIN' && organizations.length === 0) {
    const error = new Error(`Unknown active organization MSP: ${user.orgMsp}`);
    error.statusCode = 400;
    throw error;
  }
  if (user.role !== 'ADMIN') {
    const [actors] = await pool.execute(
      'SELECT actor_id FROM actors WHERE actor_id = ? AND organization_id = ? AND status = "ACTIVE"',
      [user.actorId, organizations[0].organization_id],
    );
    if (actors.length === 0) {
      const error = new Error('Actor does not belong to the selected organization');
      error.statusCode = 400;
      throw error;
    }
    const [roles] = await pool.execute(
      'SELECT role_code FROM actor_roles WHERE actor_id = ? AND role_code = ?',
      [user.actorId, user.role],
    );
    if (roles.length === 0) {
      const error = new Error(`Actor is not registered for role ${user.role}`);
      error.statusCode = 400;
      throw error;
    }
  }
  await pool.execute(
    `INSERT INTO user_accounts (username, password_hash, actor_id, role_code, organization_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), actor_id=VALUES(actor_id), role_code=VALUES(role_code),
       organization_id=VALUES(organization_id), status='ACTIVE'`,
    [user.username, hashPassword(user.password), user.role === 'ADMIN' ? null : user.actorId,
      user.role, user.role === 'ADMIN' ? null : organizations[0].organization_id],
  );
}

async function setUserStatus(username, status) {
  if (!pool) return;
  const [result] = await pool.execute(
    'UPDATE user_accounts SET status = ? WHERE username = ?',
    [status, username],
  );
  if (result.affectedRows === 0) {
    const error = new Error('User account was not found');
    error.statusCode = 404;
    throw error;
  }
}

async function resetUserPassword(username, password) {
  if (!pool) return;
  const [result] = await pool.execute(
    'UPDATE user_accounts SET password_hash = ?, status = "ACTIVE" WHERE username = ?',
    [hashPassword(password), username],
  );
  if (result.affectedRows === 0) {
    const error = new Error('User account was not found');
    error.statusCode = 404;
    throw error;
  }
}

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
    if (organizations.length === 0) throw new Error(`Unknown active organization MSP: ${actor.mspId}`);
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
    await connection.execute(
      `UPDATE lots SET region_code = ? WHERE current_holder = ? AND region_code = 'GLOBAL'`,
      [actor.regionCode || 'GLOBAL', actor.actorId],
    );
    await connection.execute(
      `UPDATE trace_events SET actor_region = ? WHERE actor_id = ? AND actor_region = 'GLOBAL'`,
      [actor.regionCode || 'GLOBAL', actor.actorId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function saveLot(lot) {
  if (!pool) return;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO lots (lot_id, product_name, origin, harvest_date, status, current_holder, created_at, last_event_id, region_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE product_name=VALUES(product_name), origin=VALUES(origin),
       harvest_date=VALUES(harvest_date), status=VALUES(status), current_holder=VALUES(current_holder),
       last_event_id=VALUES(last_event_id), region_code=VALUES(region_code)`,
      [lot.lotId, lot.productName, lot.origin, lot.harvestDate, lot.status, lot.currentHolder, mysqlDate(lot.createdAt), lot.lastEventId, lot.regionCode || 'GLOBAL'],
    );
    for (const event of lot.events) {
      await connection.execute(
        `INSERT IGNORE INTO trace_events
        (event_id, lot_id, event_type, event_timestamp, location, actor_id, actor_role, actor_region, previous_event_id, data_json, data_hash, integrity_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.eventId, lot.lotId, event.eventType, event.timestamp, event.location, event.actorId, event.actorRole,
          event.actorRegion || lot.regionCode || 'GLOBAL', event.previousEventId, JSON.stringify(event.data), event.dataHash, event.integrityHash || null, mysqlDate(new Date())],
      );
    }
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
      last_event_id AS lastEventId, (SELECT COUNT(*) FROM trace_events e WHERE e.lot_id = l.lot_id) AS eventCount
     FROM lots l ${regionCode ? 'WHERE region_code = ?' : ''} ORDER BY created_at DESC`,
    regionCode ? [regionCode] : [],
  );
  return rows;
}

async function getLot(lotId) {
  if (!pool) return null;
  const [lotRows] = await pool.execute(
    'SELECT lot_id AS lotId, product_name AS productName, origin, harvest_date AS harvestDate, status, current_holder AS currentHolder, region_code AS regionCode, created_at AS createdAt, last_event_id AS lastEventId FROM lots WHERE lot_id = ?',
    [lotId],
  );
  if (lotRows.length === 0) return null;
  const [events] = await pool.execute(
    'SELECT event_id AS eventId, lot_id AS lotId, event_type AS eventType, event_timestamp AS timestamp, location, actor_id AS actorId, actor_role AS actorRole, actor_region AS actorRegion, previous_event_id AS previousEventId, data_json AS data, data_hash AS dataHash, integrity_hash AS integrityHash FROM trace_events WHERE lot_id = ? ORDER BY created_at ASC',
    [lotId],
  );
  return {...lotRows[0], events, eventCount: events.length};
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
  await pool.execute(
    'INSERT INTO audit_log (actor_username, action_code, target_ref, details_json) VALUES (?, ?, ?, ?)',
    [entry.actorUsername, entry.action, entry.target || null, JSON.stringify(entry.details || {})],
  );
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

async function close() {
  if (pool) await pool.end();
  pool = undefined;
}

module.exports = {
  connect, close, saveLot, listLots, getLot, saveDocument, listOrganizations, listActors, saveActor, isEnabled,
  attachDocumentsToEvent, listDocuments, saveAudit, listAudit,
  authenticateUser, listUsers, saveUser, setUserStatus, resetUserPassword,
};
