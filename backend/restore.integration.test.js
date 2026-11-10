const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const enabled = /^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') && process.env.MYSQL_DATABASE === process.env.MYSQL_TEST_DATABASE;
test('backup restore: all eight original table fingerprints and six document byte hashes survive isolated restore', {skip: !enabled}, async () => {
  const root = path.resolve(__dirname, '..');
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'backups/remediation-fingerprints.json'), 'utf8'));
  const db = await require('mysql2/promise').createConnection({host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, timezone: 'Z'});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tracechain-restore-'));
  try {
    for (const table of Object.keys(expected)) {
      assert.match(table, /^[a-z_]+$/);
      const [rows] = await db.query(`SELECT * FROM ${table}`);
      const actual = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex');
      assert.equal(rows.length, expected[table].rows); assert.equal(actual, expected[table].sha256, `Restored fingerprint differs: ${table}`);
    }
    assert.equal(spawnSync('tar', ['-xzf', path.join(root, 'backups/uploads-before-remediation.tgz'), '-C', directory]).status, 0);
    const [documents] = await db.query('SELECT file_path,file_hash FROM event_documents');
    assert.equal(documents.length, expected.event_documents.rows);
    for (const document of documents) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(directory, 'uploads', path.basename(document.file_path)))).digest('hex'), document.file_hash);
  } finally {await db.end(); fs.rmSync(directory, {recursive: true, force: true});}
});
