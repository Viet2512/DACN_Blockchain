// Run only by a CA operator; application administrators never receive registrar credentials.
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes,randomUUID,createHash,X509Certificate} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
require('../backend/node_modules/dotenv').config({path: path.join(root,'.env'),quiet: true});
const mysql = require('../backend/node_modules/mysql2/promise');
const network = path.join(root,'fabric-samples/test-network');
const usernameIndex = process.argv.indexOf('--username');
const username = usernameIndex >= 0 ? process.argv[usernameIndex + 1] : null;
if (usernameIndex >= 0 && (!username || username.startsWith('--'))) throw new Error('--username requires an account name');
const testing = process.argv.includes('--test-database');
if (testing && (!/^tracechain_test_[a-f0-9]{12}$/.test(process.env.MYSQL_TEST_DATABASE || '') || process.env.MYSQL_DATABASE !== process.env.MYSQL_TEST_DATABASE)) throw new Error('A disposable test database is required');
const pending = process.argv.includes('--pending');
if (!username && !pending && !testing) throw new Error('Specify --username or --pending; bulk automatic enrollment is disabled');
const bundle = path.join(root,'backups/fabric-runtime');
const orgIndex = {Org1MSP: 1,Org2MSP: 2,Org3MSP: 3};
function run(args,home) {
  const result = spawnSync(path.join(root,'fabric-samples/bin/fabric-ca-client'),args,{env: {...process.env,FABRIC_CA_CLIENT_HOME: home},encoding: 'utf8'});
  if (result.status !== 0) throw new Error('Fabric CA enrollment failed; secrets withheld. Existing credentials were retained.');
}
async function main() {
  const db = await mysql.createConnection({host: process.env.MYSQL_HOST || '127.0.0.1',port:Number(process.env.MYSQL_PORT || 3307),database: process.env.MYSQL_DATABASE,user: process.env.MYSQL_USER,password: process.env.MYSQL_PASSWORD});
  try {
    const [users] = await db.execute("SELECT p.user_id AS userId,p.username,p.business_organization_id AS organizationId,p.region_code AS region,u.role_code AS role,f.msp_id AS mspId FROM application_user_profiles p JOIN user_accounts u ON u.username=p.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id WHERE u.status='ACTIVE' AND b.status='ACTIVE' AND f.status='ACTIVE' AND u.role_code IN ('FARMER','PROCESSOR','TRANSPORTER','DISTRIBUTOR')" + (pending ? " AND EXISTS(SELECT 1 FROM fabric_identity_requests r WHERE r.user_id=p.user_id AND r.status='PENDING')" : '') + (username ? ' AND u.username=?' : ''), username ? [username] : []);
    if (username && users.length !== 1) throw new Error('Requested active supply-chain account was not found; no identity was issued');
    const manifest = [];
    for (const user of users) {
      if (user.region === 'GLOBAL') {console.log(`Skipped GLOBAL account: ${user.username}`);continue;}
      if (![user.userId,user.organizationId,user.region].every(value => /^[A-Za-z0-9_-]{1,80}$/.test(value))) throw new Error('Unsafe identity attribute');
      const index = orgIndex[user.mspId];
      const requiredMsp = {FARMER:'Org1MSP',PROCESSOR:'Org1MSP',TRANSPORTER:'Org2MSP',DISTRIBUTOR:'Org3MSP'};
      if (!index || requiredMsp[user.role] !== user.mspId) throw new Error('User role/MSP mismatch');
      const org = `org${index}.example.com`, home = path.join(network,'organizations/peerOrganizations',org);
      const enrollmentId = 'usr-' + createHash('sha256').update([user.userId,user.organizationId,user.role,user.region].join('/')).digest('hex').slice(0,32);
      const relative = path.join('organizations/peerOrganizations',org,'users',`${enrollmentId}@${org}`,'msp');
      const msp = path.join(network,relative);
      const certPath = path.join(msp,'signcerts/cert.pem');
      if (!fs.existsSync(certPath)) {
        const password = randomBytes(24).toString('hex');
        const tls = index === 3 ? path.join(network,'addOrg3/fabric-ca/org3/tls-cert.pem') : path.join(network,`organizations/fabric-ca/org${index}/ca-cert.pem`);
        const args = ['--caname',`ca-org${index}`,'--tls.certfiles',tls];
        run(['register',...args,'--id.name',enrollmentId,'--id.secret',password,'--id.type','client','--id.attrs',`role=${user.role}:ecert,region=${user.region}:ecert,actorId=${user.userId}:ecert,userId=${user.userId}:ecert,businessOrganizationId=${user.organizationId}:ecert`],home);
        run(['enroll',...args,'-u',`https://${enrollmentId}:${password}@localhost:${{1:7054,2:8054,3:11054}[index]}`,'-M',msp],home);
        fs.copyFileSync(path.join(home,'msp/config.yaml'),path.join(msp,'config.yaml'));
      }
      const keys = fs.readdirSync(path.join(msp,'keystore'));
      if (keys.length !== 1) throw new Error('Exactly one signing key is required');
      const cert = new X509Certificate(fs.readFileSync(certPath));
      if (Date.parse(cert.validTo) <= Date.now()) throw new Error('Certificate expired; operator renewal is required');
      fs.chmodSync(path.join(msp,'keystore',keys[0]),0o600);
      fs.mkdirSync(bundle,{recursive: true,mode: 0o700});
      fs.cpSync(msp,path.join(bundle,relative),{recursive:true});
      const certificateReference = path.join(relative,'signcerts/cert.pem'), privateKeyReference = path.join(relative,'keystore',keys[0]);
      const certificateSha256 = cert.fingerprint256.replace(/:/g,'').toLowerCase();
      await db.beginTransaction();
      try {
        const [current]=await db.execute("SELECT u.status,b.status AS businessStatus,f.status AS fabricStatus,u.role_code,p.business_organization_id,p.region_code FROM user_accounts u JOIN application_user_profiles p ON p.username=u.username JOIN business_organizations b ON b.id=p.business_organization_id JOIN fabric_organizations f ON f.id=b.fabric_organization_id WHERE u.username=? FOR UPDATE",[user.username]);
        const account=current[0];
        if(!account || account.status!=='ACTIVE' || account.businessStatus!=='ACTIVE' || account.fabricStatus!=='ACTIVE' || account.role_code!==user.role || account.business_organization_id!==user.organizationId || account.region_code!==user.region) throw new Error('Account changed during enrollment; identity was not linked');
        await db.execute("UPDATE fabric_identities SET status='DISABLED' WHERE user_id=? AND status='ACTIVE' AND enrollment_id<>?",[user.userId,enrollmentId]);
        const [existing] = await db.execute('SELECT status FROM fabric_identities WHERE enrollment_id=?',[enrollmentId]);
        if (existing[0]?.status === 'REVOKED') throw new Error('Revoked enrollment cannot be reactivated');
        await db.execute("INSERT INTO fabric_identities(id,user_id,msp_id,business_organization_id,role_code,enrollment_id,certificate_reference,private_key_reference,certificate_sha256,status) VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE') ON DUPLICATE KEY UPDATE status='ACTIVE'",[randomUUID(),user.userId,user.mspId,user.organizationId,user.role,enrollmentId,certificateReference,privateKeyReference,certificateSha256]);
        await db.execute("UPDATE fabric_identity_requests SET status='ISSUED' WHERE user_id=?",[user.userId]);
        await db.execute("INSERT INTO identity_audit_logs(action,resource_type,resource_id,result,details) VALUES ('FABRIC_IDENTITY_ISSUED','user',?,'SUCCESS',?)",[user.userId,JSON.stringify({operator:'CA_OPERATOR',mspId:user.mspId})]);
        await db.commit();
      } catch(error) {await db.rollback();throw error;}
      manifest.push({...user,enrollmentId,certificateReference,privateKeyReference,certificateSha256});
    }
    const reader = 'organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp';
    fs.cpSync(path.join(network,reader),path.join(bundle,reader),{recursive:true});
    const tls = 'organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt';
    fs.mkdirSync(path.dirname(path.join(bundle,tls)),{recursive:true});fs.copyFileSync(path.join(network,tls),path.join(bundle,tls));
    const manifestFile = testing ? `backups/fabric-identities-${process.env.MYSQL_TEST_DATABASE}.json` : username ? `backups/fabric-user-${createHash('sha256').update(username).digest('hex')}.json` : 'backups/fabric-user-identities.json';
    fs.writeFileSync(path.join(root,manifestFile),JSON.stringify(manifest,null,2),{mode:0o600});
    console.log(`Verified ${manifest.length} per-user identity mappings; enrollment secrets and keys withheld.`);
  } finally {await db.end();}
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
