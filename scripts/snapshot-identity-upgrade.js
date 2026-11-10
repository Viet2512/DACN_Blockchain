const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');require('../backend/node_modules/dotenv').config({path:path.join(root,'.env'),quiet:true});
async function main(){
 const db=await require('../backend/node_modules/mysql2/promise').createConnection({host:'127.0.0.1',port:3307,database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,timezone:'Z'});
 const tables=['organizations','actors','actor_roles','user_accounts','lots','trace_events','event_documents','audit_log','lot_records','fabric_projections'];const fingerprint={};
 try{for(const table of tables){const [rows]=await db.query(`SELECT * FROM ${table}`);fingerprint[table]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex')};}}
 finally{await db.end();}
 const file=path.join(root,'backups/identity-upgrade-fingerprints.json');
 if(process.argv.includes('--capture'))fs.writeFileSync(file,JSON.stringify(fingerprint,null,2),{flag:'wx',mode:0o600});
 else{require('node:assert/strict').deepEqual(fingerprint,JSON.parse(fs.readFileSync(file,'utf8')));console.log('All ten pre-upgrade tables are unchanged.');}
 console.log(JSON.stringify(fingerprint,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
