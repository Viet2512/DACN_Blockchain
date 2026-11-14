const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..');
test('startup waits for health, preserves Fabric and fails clearly when Docker or a service is unavailable',async()=>{
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'tracechain-startup-'));
 const log=path.join(temporary,'calls.jsonl');
 try{
  await fs.writeFile(path.join(temporary,'docker'),`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.QA_DOCKER_LOG,JSON.stringify(args)+'\\n');if(args[0]==='info' && process.env.QA_ENGINE_DOWN==='true')process.exit(1);if(args[0]==='compose' && process.env.QA_START_FAIL==='true')process.exit(1);if(args[0]==='container' && process.env.QA_MISSING_CONTAINER==='true')process.exit(1);if(args[0]==='start' && process.env.QA_FABRIC_FAIL==='true')process.exit(1);\n`,{mode:0o700});
  const env={...process.env,PATH:temporary+path.delimiter+process.env.PATH,QA_DOCKER_LOG:log};
  const execute=extra=>promisify(execFile)('bash',['scripts/up.sh'],{cwd:root,env:{...env,...extra}});
  const success=await execute();assert.match(success.stdout,/TraceChain:/);
  await promisify(execFile)('bash',['scripts/stop.sh'],{cwd:root,env});
  const calls=(await fs.readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(calls.some(args=>args.includes('--wait') && args.includes('--wait-timeout')));
  assert.ok(calls.every(args=>!args.includes('--build')));
  assert.ok(calls.some(args=>args.includes('stop') && args.includes('frontend') && args.includes('mysql')));
  assert.ok(calls.some(args=>args[0]==='start' && args.includes('peer0.org3.example.com')));
  const resumed=calls.find(args=>args[0]==='start').slice(1);
  assert.deepEqual(calls.find(args=>args[0]==='update'),['update','--restart','unless-stopped',...resumed]);
  assert.ok(calls.every(args=>!args.some(value=>['down','prune','rm','restart'].includes(value))));
  await assert.rejects(execute({QA_ENGINE_DOWN:'true'}),error=>error.stderr.includes('Docker Desktop') && !error.stdout.includes('TraceChain:'));
  await assert.rejects(execute({QA_START_FAIL:'true'}),error=>!error.stdout.includes('TraceChain:'));
  for(const failure of [{QA_MISSING_CONTAINER:'true'},{QA_FABRIC_FAIL:'true'}]) {
    await fs.writeFile(log,'');
    await assert.rejects(execute(failure),error=>!error.stdout.includes('TraceChain:'));
    const failedCalls=(await fs.readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.ok(failedCalls.every(args=>!['compose','update'].includes(args[0])));
  }
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
});
