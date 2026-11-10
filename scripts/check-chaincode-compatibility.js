const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
process.env.FABRIC_ENABLED='true';const fabric=require('../backend/fabric');
async function main(){
 const file=path.join(__dirname,'../backups/identity-upgrade-ledger-snapshot.json');
 const capture=process.argv.includes('--capture');const saved=capture?null:JSON.parse(fs.readFileSync(file,'utf8'));
 const lotId=capture?process.argv[process.argv.indexOf('--capture')+1]:saved.lot.lotId;
 if(!lotId)throw new Error('An existing ledger LotID is required');
 try{
  const snapshot={lot:await fabric.readLot(lotId),events:await fabric.history(lotId)};
  if(capture)fs.writeFileSync(file,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
  else{assert.deepEqual(snapshot,saved);const validation=await fabric.validateHistory(lotId);assert.equal(validation.valid,true);assert.equal(validation.businessIdentityVerified,false);}
  console.log({lotId,eventCount:snapshot.events.length,unchanged:!capture});
 }finally{await fabric.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
