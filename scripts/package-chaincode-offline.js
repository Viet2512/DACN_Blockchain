// Build a standard Fabric Node package using integrity-checked npm cache blobs, without registry access in peers.
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'chaincode'),stage=path.join(root,'backups/chaincode-business-package'),check=path.join(root,'backups/chaincode-business-package-check');
function run(command,args,options={}){const result=spawnSync(command,args,{encoding:'utf8',...options});if(result.status!==0)throw new Error(`${command} failed: ${result.stderr?.slice(-1000) || ''}`);return result.stdout;}
function main(){
 const hostCache=run('npm',['config','get','cache']).trim() || path.join(os.homedir(),'.npm');
 const cache=path.join(stage,'.npm-cache');fs.mkdirSync(cache,{recursive:true});
 for(const file of ['package.json','npm-shrinkwrap.json']){fs.copyFileSync(path.join(source,file),path.join(stage,file));fs.mkdirSync(check,{recursive:true});fs.copyFileSync(path.join(source,file),path.join(check,file));}
 fs.cpSync(path.join(source,'dist'),path.join(stage,'dist'),{recursive:true});
 const lock=JSON.parse(fs.readFileSync(path.join(source,'npm-shrinkwrap.json'),'utf8'));let count=0;
 for(const [name,meta] of Object.entries(lock.packages)){
  if(!name || meta.dev)continue;
  assert.ok(meta.integrity && meta.resolved?.startsWith('https://registry.npmjs.org/'),'Only lockfile-pinned public registry dependencies are accepted');
  const [algorithm,encoded]=meta.integrity.split('-');assert.ok(['sha512','sha1'].includes(algorithm));const hex=Buffer.from(encoded,'base64').toString('hex');const relative=path.join('_cacache/content-v2',algorithm,hex.slice(0,2),hex.slice(2,4),hex.slice(4));
  const target=path.join(cache,relative),cached=path.join(hostCache,relative);
  if(fs.existsSync(cached)){const bytes=fs.readFileSync(cached);assert.equal(createHash(algorithm).update(bytes).digest('base64'),encoded);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(cached,target);}
  else run('npm',['cache','add',meta.resolved,'--cache',cache,'--fetch-timeout=30000','--fetch-retries=1','--no-audit','--no-fund']);
  assert.equal(createHash(algorithm).update(fs.readFileSync(target)).digest('base64'),encoded);count++;
 }
 run('npm',['ci','--offline','--omit=dev','--cache',cache,'--no-audit','--no-fund'],{cwd:check});
 fs.writeFileSync(path.join(stage,'.npmrc'),'cache=/chaincode/output/.npm-cache\noffline=true\naudit=false\nfund=false\n');
 const output=path.join(root,'fabric-samples/test-network/traceability_v2.tar.gz');
 run(path.join(root,'fabric-samples/bin/peer'),['lifecycle','chaincode','package',output,'--path',stage,'--lang','node','--label','traceability_v2_4.3'],{env:{...process.env,FABRIC_CFG_PATH:path.join(root,'fabric-samples/config')}});
 console.log(`Packaged ${count} integrity-checked runtime dependencies; offline npm ci self-check passed.`);
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
