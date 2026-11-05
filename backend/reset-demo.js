require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  const [lots] = await db.query(
    `SELECT lot_id FROM lots
     WHERE lot_id IN ('1', '3')
        OR lot_id LIKE 'DIRECT-%'
        OR lot_id LIKE 'MYSQL-%'
        OR lot_id LIKE 'LOT_BACKEND_%'`,
  );
  const ids = lots.map(({lot_id: id}) => id);
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    await db.query(`DELETE FROM event_documents WHERE lot_id IN (${marks})`, ids);
    await db.query(`DELETE FROM trace_events WHERE lot_id IN (${marks})`, ids);
    await db.query(`DELETE FROM lots WHERE lot_id IN (${marks})`, ids);
  }
  await db.end();
  console.log(`Removed ${ids.length} legacy demo lots. Kept LOT-DEMO-001 and LOT-DEMO-002.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
