const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
require('../backend/node_modules/dotenv').config({path:path.join(root,'.env'),quiet:true});
async function main() {
  const db = await require('../backend/node_modules/mysql2/promise').createConnection({host:'127.0.0.1',port:3307,database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,multipleStatements:true});
  try {
    const sql=fs.readFileSync(path.join(root,'backend/migrations/004-identity-organizations.sql'),'utf8');
    if (/\b(DROP|DELETE|TRUNCATE|ALTER)\s/i.test(sql)) throw new Error('Identity migration must be additive');
    await db.query(sql);
    const [[counts]]=await db.query('SELECT (SELECT COUNT(*) FROM user_accounts) AS accounts,(SELECT COUNT(*) FROM application_user_profiles) AS profiles,(SELECT COUNT(*) FROM business_organizations) AS businesses,(SELECT COUNT(*) FROM fabric_organizations) AS msps');
    if (counts.accounts !== counts.profiles || counts.msps !== 3) throw new Error('Migration mapping counts mismatch; old tables were retained');
    console.log({migration:'004-identity-organizations',...counts});
  } finally {await db.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
