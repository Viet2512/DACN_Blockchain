// Explicit, repeatable migration; no account or historical data is removed.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
require('../backend/node_modules/dotenv').config({path:path.join(root,'.env'),quiet:true});
async function main() {
  const db = await require('../backend/node_modules/mysql2/promise').createConnection({host:process.env.MYSQL_HOST || '127.0.0.1',port:Number(process.env.MYSQL_PORT || 3307),database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,multipleStatements:true});
  try {
    const [[column]] = await db.query("SELECT COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_accounts' AND column_name='status'");
    if (!column.type.includes('PENDING_ACTIVATION')) await db.query("ALTER TABLE user_accounts MODIFY status ENUM('ACTIVE','INACTIVE','PENDING_ACTIVATION') NOT NULL DEFAULT 'ACTIVE'");
    const [columns] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='user_accounts' AND column_name='last_login_at'");
    if (!columns.length) await db.query('ALTER TABLE user_accounts ADD COLUMN last_login_at DATETIME(3) NULL');
    await db.query(fs.readFileSync(path.join(root,'backend/migrations/007-account-hierarchy.sql'),'utf8'));
    await db.query(fs.readFileSync(path.join(root,'backend/migrations/008-fabric-identity-issuance.sql'),'utf8'));
    console.log('007/008: account hierarchy and Fabric issuance permissions applied; existing data retained.');
  } finally {await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
