const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomBytes,createHash,X509Certificate}=require('node:crypto');
const storage=require('./storage');

const active=new Set();
const orgs={
  Org1MSP:{index:1,host:'org1.example.com',containerCa:'org1.example.com:7054',localCa:'localhost:7054',tls:'organizations/fabric-ca/org1/ca-cert.pem'},
  Org2MSP:{index:2,host:'org2.example.com',containerCa:'org2.example.com:8054',localCa:'localhost:8054',tls:'organizations/fabric-ca/org2/ca-cert.pem'},
  Org3MSP:{index:3,host:'org3.example.com',containerCa:'org3.example.com:11054',localCa:'localhost:11054',tls:'addOrg3/fabric-ca/org3/tls-cert.pem'},
};

function configuration() {
  if(process.env.FABRIC_CA_OPERATOR_ENABLED!=='true') throw Object.assign(new Error('Cấp chứng thư từ ứng dụng chưa được bật trên môi trường này'),{statusCode:503});
  const operatorRoot=path.resolve(process.env.FABRIC_CA_OPERATOR_ROOT || path.join(__dirname,'../fabric-samples/test-network'));
  const runtimeRoot=path.resolve(process.env.FABRIC_RUNTIME_ROOT || process.env.FABRIC_NETWORK_ROOT || operatorRoot);
  const client=path.resolve(process.env.FABRIC_CA_CLIENT || path.join(__dirname,'../fabric-samples/bin/fabric-ca-client'));
  if(!fs.existsSync(client) || !fs.existsSync(operatorRoot) || !fs.existsSync(runtimeRoot)) throw Object.assign(new Error('CA operator runtime chưa sẵn sàng'),{statusCode:503});
  return {operatorRoot,runtimeRoot,client};
}

function run(client,args,home) {
  const result=spawnSync(client,args,{env:{...process.env,FABRIC_CA_CLIENT_HOME:home},encoding:'utf8'});
  if(result.status!==0) throw Object.assign(new Error('Fabric CA từ chối cấp chứng thư; secret được ẩn'),{statusCode:502});
}

async function issueApproved(username) {
  if(active.has(username)) throw Object.assign(new Error('Yêu cầu cấp chứng thư đang được xử lý'),{statusCode:409});
  active.add(username);
  try {
    const target=await storage.operatorProvisioningTarget(username);
    const config=configuration(),org=orgs[target.mspId];
    if(!org) throw Object.assign(new Error('MSP chưa được cấu hình CA operator'),{statusCode:409});
    const enrollmentId='usr-'+createHash('sha256').update([target.userId,target.organizationId,target.role,target.region].join('/')).digest('hex').slice(0,32);
    const relative=path.join('organizations/peerOrganizations',org.host,'users',`${enrollmentId}@${org.host}`,'msp');
    const operatorMsp=path.join(config.operatorRoot,relative),certPath=path.join(operatorMsp,'signcerts/cert.pem');
    const home=path.join(config.operatorRoot,'organizations/peerOrganizations',org.host),tls=path.join(config.operatorRoot,org.tls);
    const ca=process.env.FABRIC_CA_OPERATOR_ROOT ? org.containerCa : org.localCa;
    if(!fs.existsSync(certPath)) {
      const secret=randomBytes(24).toString('hex'),common=['--caname',`ca-org${org.index}`,'--tls.certfiles',tls];
      run(config.client,['register',...common,'-u',`https://${ca}`,'--id.name',enrollmentId,'--id.secret',secret,'--id.type','client','--id.attrs',`role=${target.role}:ecert,region=${target.region}:ecert,actorId=${target.userId}:ecert,userId=${target.userId}:ecert,businessOrganizationId=${target.organizationId}:ecert`],home);
      run(config.client,['enroll',...common,'-u',`https://${enrollmentId}:${secret}@${ca}`,'-M',operatorMsp],home);
      fs.copyFileSync(path.join(home,'msp/config.yaml'),path.join(operatorMsp,'config.yaml'));
    }
    const keys=fs.readdirSync(path.join(operatorMsp,'keystore'));
    if(keys.length!==1) throw Object.assign(new Error('Kho signer phải có đúng một private key'),{statusCode:503});
    const cert=new X509Certificate(fs.readFileSync(certPath));
    if(Date.now()<Date.parse(cert.validFrom) || Date.now()>=Date.parse(cert.validTo)) throw Object.assign(new Error('Chứng thư ngoài thời hạn hiệu lực'),{statusCode:503});
    const runtimeMsp=path.join(config.runtimeRoot,relative);
    if(runtimeMsp!==operatorMsp){fs.mkdirSync(path.dirname(runtimeMsp),{recursive:true,mode:0o700});fs.cpSync(operatorMsp,runtimeMsp,{recursive:true});}
    const runtimeKey=path.join(runtimeMsp,'keystore',keys[0]);fs.chmodSync(runtimeKey,0o600);
    const identity={enrollmentId,certificateReference:path.join(relative,'signcerts/cert.pem'),privateKeyReference:path.join(relative,'keystore',keys[0]),certificateSha256:cert.fingerprint256.replace(/:/g,'').toLowerCase()};
    await storage.saveProvisionedIdentity(target,identity,{userId:target.approvedBy,organizationId:target.approverOrganizationId});
    return {username:target.username,userId:target.userId,organizationId:target.organizationId,mspId:target.mspId,role:target.role,enrollmentId,status:'ACTIVE',fingerprint:identity.certificateSha256};
  } finally {active.delete(username);}
}

module.exports={issueApproved};
