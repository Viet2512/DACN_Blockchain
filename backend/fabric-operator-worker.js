require('dotenv').config();
const storage=require('./storage');
const enrollment=require('./fabric-enrollment');

const interval=Math.max(1000,Number(process.env.FABRIC_CA_OPERATOR_INTERVAL_MS || 2000));
let stopping=false;

async function processApproved() {
  const requests=(await storage.listIdentityRequests()).filter(item=>item.status==='APPROVED');
  for(const request of requests) {
    try {
      await enrollment.issueApproved(request.username);
      console.log(`Fabric identity issued for ${request.username}`);
    } catch(error) {
      await storage.failIdentityIssuance(request.userId,error.message);
      console.error(`Fabric identity issuance failed for ${request.username}: ${error.message}`);
    }
  }
}

async function main() {
  if(process.env.FABRIC_CA_OPERATOR_ENABLED!=='true') throw new Error('FABRIC_CA_OPERATOR_ENABLED=true is required');
  await storage.connect();
  while(!stopping) {
    await processApproved();
    await new Promise(resolve=>setTimeout(resolve,interval));
  }
  await storage.close();
}

for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>{stopping=true;});
main().catch(async error=>{console.error(error.message);await storage.close();process.exitCode=1;});
