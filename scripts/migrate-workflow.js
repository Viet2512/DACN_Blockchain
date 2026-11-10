// Additive only; back up the database before explicitly running this migration.
const path = require('node:path'), fs = require('node:fs');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
async function main() {
    const db = await require('../backend/node_modules/mysql2/promise').createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, multipleStatements: true });
    try {
        await db.query(fs.readFileSync(path.join(__dirname, '../backend/migrations/006-custody-workflow.sql'), 'utf8'));
        console.log('006: projection table and workflow permissions added; historical lots/events unchanged.');
    }
    finally {
        await db.end();
    }
}
main().catch(error => { console.error(error.code || error.name); process.exitCode = 1; });
