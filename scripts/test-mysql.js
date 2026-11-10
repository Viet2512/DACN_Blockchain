// Test only in a disposable database; never send mutations to the active database.
const {spawnSync} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const fabric = process.argv.includes('--fabric');
const delivery = process.argv.includes('--delivery');
if(delivery && !fabric) throw new Error('--delivery requires --fabric; ledger tests cannot run in local mode');
const accounts = process.argv.includes('--accounts');
const identity = process.argv.includes('--identity');
const restoreIndex = process.argv.indexOf('--restore');
const restore = restoreIndex >= 0 ? path.resolve(process.argv[restoreIndex + 1] || '') : null;
const suffix = randomBytes(6).toString('hex');
const database = `tracechain_test_${suffix}`;
const user = `tc_test_${suffix}`;
const password = randomBytes(24).toString('hex');
function sql(input, db) {
  const args = ['compose', 'exec', '-T', 'mysql', 'sh', '-c',
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root "$@"', 'sh', ...(db ? [db] : [])];
  const result = spawnSync('docker', args, {cwd: root, input, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || 'MySQL administrative command failed');
}
let created = false;
try {
  sql(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
  created = true;
  sql(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'; GRANT ALL ON \`${database}\`.* TO '${user}'@'%';`);
  const schema = fs.readFileSync(restore || path.join(root, 'backend/schema.sql'), 'utf8');
  if (restore && /^\s*(USE|CREATE\s+DATABASE|DROP\s+DATABASE)\b/im.test(schema)) throw new Error('Backup must contain tables only, without database selection statements');
  sql(schema, database);
  if (!restore) {
    const migration = spawnSync(process.execPath, ['scripts/migrate-actors.js'], {
      cwd: root, stdio: 'inherit', env: {...process.env, MYSQL_HOST: '127.0.0.1', MYSQL_PORT: process.env.MYSQL_TEST_PORT || '3307', MYSQL_DATABASE: database, MYSQL_USER: user, MYSQL_PASSWORD: password},
    });
    if (migration.status !== 0) throw new Error('Actor compatibility migration failed in isolated database');
  }
  const result = spawnSync(process.execPath, ['--test', restore ? 'backend/restore.integration.test.js' : delivery ? 'backend/delivery.integration.test.js' : accounts ? 'backend/accounts.integration.test.js' : identity ? 'backend/identity.integration.test.js' : fabric ? 'backend/fabric.integration.test.js' : 'backend/mysql.integration.test.js'], {
    cwd: root, stdio: 'inherit', env: {...process.env, NODE_ENV:'test', PUBLIC_BASE_URL:'http://localhost:3001', DELIVERY_INTEGRATION:String(delivery), ACCOUNT_INTEGRATION:String(accounts), IDENTITY_INTEGRATION: String(identity || fabric), MYSQL_ENABLED: 'true',
      MYSQL_HOST: '127.0.0.1', MYSQL_PORT: process.env.MYSQL_TEST_PORT || '3307',
      MYSQL_DATABASE: database, MYSQL_TEST_DATABASE: database, MYSQL_USER: user,
      MYSQL_PASSWORD: password, ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD: password,
      FABRIC_ENABLED: String(fabric), FABRIC_CA_OPERATOR_ENABLED:String(fabric), FABRIC_NETWORK_ROOT: path.join(root, 'fabric-samples/test-network'), FABRIC_IDENTITIES_FILE: path.join(root, 'backups/fabric-identities.json'), FABRIC_CHANNEL: 'tracechannel-v2', FABRIC_CHAINCODE: 'traceability_v2'},
  });
  process.exitCode = result.status ?? 1;
} catch (error) {console.error(error.message); process.exitCode = 1;}
finally {
  if (created) {
    // Names are generated above, never accepted from environment or a user argument.
    sql(`DROP DATABASE \`${database}\`; DROP USER IF EXISTS '${user}'@'%';`);
    console.log('Disposed isolated MySQL test database; active database untouched.');
  }
}
