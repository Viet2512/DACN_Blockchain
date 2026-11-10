// Run explicitly before deploying; never migrate historical events or identities at startup.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('../backend/node_modules/dotenv').config({path: path.join(root, '.env'), quiet: true});
async function main() {
  const db = await require('../backend/node_modules/mysql2/promise').createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307),
    database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, multipleStatements: true,
  });
  try {
    const [columns] = await db.execute("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='application_user_profiles' AND column_name='phone'");
    if (!columns.length) {
      await db.query('ALTER TABLE application_user_profiles ADD COLUMN phone VARCHAR(40) NULL');
      await db.query('UPDATE application_user_profiles p JOIN user_accounts u ON u.username=p.username JOIN actors a ON a.actor_id=u.actor_id SET p.phone=a.phone');
    }
    await db.query(fs.readFileSync(path.join(root, 'backend/migrations/005-actor-user-mappings.sql'), 'utf8'));
    const [[{missing}]] = await db.query('SELECT COUNT(*) AS missing FROM application_user_profiles p JOIN user_accounts u ON u.username=p.username LEFT JOIN user_actor_mappings m ON m.user_id=p.user_id AND m.actor_id=u.actor_id WHERE u.actor_id IS NOT NULL AND m.user_id IS NULL');
    if (missing) throw new Error('Actor compatibility mappings are incomplete');
    console.log('005: user phone and actor compatibility mappings verified; historical tables retained.');
  } finally {await db.end();}
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
