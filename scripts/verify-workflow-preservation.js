const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const database = 'tracechain_test_' + randomBytes(6).toString('hex');
function sql(input, db) { const result = spawnSync('docker', ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root "$@"', 'sh', ...(db ? [db] : [])], { input, encoding: 'utf8' }); if (result.status !== 0)
    throw new Error('Isolated restore failed'); }
async function main() {
    const file = process.argv[2];
    if (!file || !fs.existsSync(file))
        throw new Error('Provide an existing pre-upgrade MySQL backup');
    const dump = fs.readFileSync(file, 'utf8');
    assert.ok(!/^\s*(USE|CREATE\s+DATABASE|DROP\s+DATABASE)\b/im.test(dump), 'Only a table-level backup is accepted');
    sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4;`);
    try {
        sql(dump, database);
        // The app user has no access to the restore database; hash both sets inside their own database using the same administrative pipe.
        const tables = ['organizations', 'actors', 'actor_roles', 'user_accounts', 'lots', 'trace_events', 'event_documents', 'audit_log'];
        const results = [];
        for (const table of tables) {
            const read = (name) => { const result = spawnSync('docker', ['compose', 'exec', '-T', 'mysql', 'sh', '-c', 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root "$@"', 'sh', name, '-e', `SELECT * FROM ${table}`], { encoding: 'utf8' }); assert.equal(result.status, 0, 'Database read failed'); return result.stdout.split('\n').filter(Boolean).sort(); };
            const original = read(database), current = read(process.env.MYSQL_DATABASE);
            if (JSON.stringify(current) !== JSON.stringify(original))
                throw new Error(`${table} changed; row values withheld`);
            results.push({ table, rows: current.length, sha256: createHash('sha256').update(JSON.stringify(current)).digest('hex'), unchanged: true });
        }
        const documents=spawnSync('docker',['compose','exec','-T','mysql','sh','-c','MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --batch --skip-column-names --user=root "$@"','sh',process.env.MYSQL_DATABASE,'-e','SELECT file_path,file_hash FROM event_documents'],{encoding:'utf8'});
        assert.equal(documents.status,0,'Document metadata read failed');
        const files=documents.stdout.trim().split('\n').filter(Boolean);
        for(const row of files){const [filePath,expected]=row.split('\t');const checked=spawnSync('docker',['compose','exec','-T','backend','node','-e',"process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('/app/uploads/'+process.argv[1])).digest('hex'))",path.basename(filePath)],{encoding:'utf8'});assert.equal(checked.status,0,'Protected document could not be checked in its container');assert.equal(checked.stdout.trim(),expected,'Document bytes differ; file contents withheld');}
        fs.writeFileSync(path.join(__dirname, '../reports/data-preservation.json'), JSON.stringify({ checkedAt: new Date().toISOString(), backup: path.basename(file), results, documentsChecked:files.length }, null, 2));
        console.log('Eight historical tables match the pre-upgrade backup by row fingerprints.');
    }
    finally {
        sql(`DROP DATABASE ${database};`);
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
