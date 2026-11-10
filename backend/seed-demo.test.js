const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
test('seeding existing lots never submits, uploads or changes business data',async()=>{
 const mutations=[];let reads=0;
 const server=http.createServer((req,res)=>{
  req.resume();res.setHeader('Content-Type','application/json');
  if(req.url==='/api/auth/login')return res.end(JSON.stringify({token:'test-session'}));
  if(req.method!=='GET')mutations.push(req.url);
  if(req.url.startsWith('/api/lots/')){reads++;return res.end(JSON.stringify({lotId:req.url.split('/').at(-1),schemaVersion:4,status:'HARVESTED'}));}
  res.end(JSON.stringify(req.url==='/api/business-organizations'?[]:{status:'ok'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await promisify(execFile)(process.execPath,[path.join(__dirname,'seed-demo.js'),'--lots'],{env:{...process.env,API_URL:`http://127.0.0.1:${server.address().port}/api`,ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-fixture-only',DEMO_PASSWORD:'test-fixture-only'}});
  assert.equal(reads,7);assert.deepEqual(mutations,[]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('seed reports credential mismatch without changing passwords or submitting lots',async()=>{
 const writes=[];
 const server=http.createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');if(req.url==='/api/auth/login'){res.statusCode=401;return res.end(JSON.stringify({error:'Invalid username or password'}));}if(req.method!=='GET')writes.push(req.url);res.end(JSON.stringify({status:'ok'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await assert.rejects(promisify(execFile)(process.execPath,[path.join(__dirname,'seed-demo.js'),'--lots'],{env:{...process.env,API_URL:`http://127.0.0.1:${server.address().port}/api`,ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-fixture-only',DEMO_PASSWORD:'test-fixture-only'}}),error=>error.stderr.includes('seed không đổi mật khẩu tài khoản đã có') && !error.stderr.includes('test-fixture-only'));assert.deepEqual(writes,[]);}finally{await new Promise(resolve=>server.close(resolve));}
});
