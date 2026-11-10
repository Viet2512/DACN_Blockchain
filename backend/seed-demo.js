require('dotenv').config();
const mysql = require('mysql2/promise');
const API = process.env.API_URL || 'http://localhost:8080/api';
const password = process.env.DEMO_PASSWORD;
const phase = process.argv.includes('--accounts') ? 'accounts' : process.argv.includes('--lots') ? 'lots' : 'all';
const organizations = [
  {code:'FARM-MEKONG',name:'Nông trại Mekong Xanh',type:'FARM',mspId:'Org1MSP',address:'Cái Bè, Tiền Giang',email:'mekong@tracechain.test',phone:'0901000001'},
  {code:'FARM-AN-PHU',name:'Hợp tác xã Nông nghiệp An Phú',type:'FARM',mspId:'Org1MSP',address:'Châu Thành, Đồng Tháp',email:'anphu@tracechain.test',phone:'0901000002'},
  {code:'PROC-TIEN-GIANG',name:'Trung tâm Sơ chế Tiền Giang',type:'PROCESSING_FACILITY',mspId:'Org1MSP',address:'Mỹ Tho, Tiền Giang',email:'soche@tracechain.test',phone:'0901000003'},
  {code:'LOG-MIEN-TAY',name:'Công ty Vận tải Lạnh Miền Tây',type:'LOGISTICS_COMPANY',mspId:'Org2MSP',address:'Bình Thủy, Cần Thơ',email:'vantai@tracechain.test',phone:'0901000004'},
  {code:'DIST-SAI-GON',name:'Hệ thống Phân phối Sài Gòn Fresh',type:'DISTRIBUTION_COMPANY',mspId:'Org3MSP',address:'Thủ Đức, TP.HCM',email:'phanphoi@tracechain.test',phone:'0901000005'},
];
const users = [
  ['demo-farmer','Nguyễn Minh An','FARMER','FARM-MEKONG','0911000001'],
  ['demo-farmer-2','Trần Ngọc Lan','FARMER','FARM-AN-PHU','0911000002'],
  ['demo-processor','Lê Hoàng Bình','PROCESSOR','PROC-TIEN-GIANG','0911000003'],
  ['demo-transporter','Phạm Quốc Chuyển','TRANSPORTER','LOG-MIEN-TAY','0911000004'],
  ['demo-transporter-2','Võ Thanh Hà','TRANSPORTER','LOG-MIEN-TAY','0911000005'],
  ['demo-distributor','Đặng Thu Phương','DISTRIBUTOR','DIST-SAI-GON','0911000006'],
].map(([username,fullName,role,organizationCode,phone])=>({username,fullName,role,organizationCode,phone,email:`${username}@tracechain.test`,regionCode:'TG-001'}));
const lots = [
  ['LOT-MAU-2026-001','Xoài cát Hòa Lộc loại 1','Vùng trồng Cái Bè, Tiền Giang','2026-11-01','demo-farmer',6],
  ['LOT-MAU-2026-002','Bưởi da xanh tuyển chọn','Vùng trồng Mekong Xanh','2026-11-02','demo-farmer',5],
  ['LOT-MAU-2026-003','Thanh long ruột đỏ','Hợp tác xã An Phú, Đồng Tháp','2026-11-03','demo-farmer-2',4],
  ['LOT-MAU-2026-004','Cam sành VietGAP','Vùng trồng Mekong Xanh','2026-11-04','demo-farmer',3],
  ['LOT-MAU-2026-005','Mít Thái siêu sớm','Hợp tác xã An Phú, Đồng Tháp','2026-11-05','demo-farmer-2',2],
  ['LOT-MAU-2026-006','Dừa xiêm xanh','Vùng trồng Cái Bè, Tiền Giang','2026-11-06','demo-farmer',0],
  ['LOT-MAU-2026-007','Ổi nữ hoàng','Hợp tác xã An Phú, Đồng Tháp','2026-10-31','demo-farmer-2','recall'],
].map(([lotId,productName,origin,harvestDate,farmer,steps])=>({lotId:process.env.DEMO_LOT_PREFIX ? lotId.replace("LOT-MAU",process.env.DEMO_LOT_PREFIX) : lotId,productName,origin,harvestDate,farmer,steps}));

async function request(path,token,options={}) {
  const response=await fetch(API+path,{...options,headers:{...(options.headers||{}),...(token?{Authorization:`Bearer ${token}`}:{})}});
  const body=response.status===204?null:await response.json();
  if(!response.ok) throw new Error(`${options.method||'GET'} ${path}: ${body?.message||body?.error||response.statusText}`);
  return body;
}
const json=(method,data)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
async function login(username,secret=password){
  try{return (await request('/auth/login',null,json('POST',{username,password:secret}))).token;}
  catch(error){throw new Error(`Đăng nhập ${username} thất bại; seed không đổi mật khẩu tài khoản đã có. ${error.message}`,{cause:error});}
}

async function bootstrapFabricOrganizations(){
  const db=await mysql.createConnection({host:process.env.MYSQL_HOST||'mysql',port:Number(process.env.MYSQL_PORT||3306),database:process.env.MYSQL_DATABASE,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try {
    for(const [mspId,name,type] of [['Org1MSP','Liên minh Sản xuất & Sơ chế','PRODUCER_PROCESSOR'],['Org2MSP','Liên minh Vận tải','TRANSPORTER'],['Org3MSP','Liên minh Phân phối','DISTRIBUTOR']]) await db.execute('INSERT IGNORE INTO organizations(msp_id,name,organization_type,address) VALUES (?,?,?,?)',[mspId,name,type,'Mạng Fabric TraceChain']);
    await db.query('INSERT IGNORE INTO fabric_organizations(id,msp_id,name,status) SELECT organization_id,msp_id,name,status FROM organizations');
  } finally {await db.end();}
}
async function seedAccounts(){
  await bootstrapFabricOrganizations();
  const admin=await login(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD);
  const current=await request('/business-organizations',admin),ids={};
  for(const organization of organizations){let row=current.find(item=>item.code===organization.code);if(!row)row=await request('/business-organizations',admin,json('POST',organization));ids[organization.code]=row.organizationId;}
  const accounts=await request('/users',admin);
  for(const user of users)if(!accounts.some(item=>item.username===user.username))await request('/users',admin,json('POST',{...user,password,organizationId:ids[user.organizationCode]}));
  const requests=await request('/fabric-identity-requests',admin);
  const candidates=(await request('/users',admin)).filter(account=>users.some(sample=>sample.username===account.username) && account.status==='ACTIVE' && account.fabricIdentityStatus==='PENDING' && !requests.some(entry=>entry.userId===account.userId && entry.status==='DISABLED'));
  if(candidates.length){
    const storage=require('./storage');
    await storage.connect();
    try{const actor=await request('/auth/me',admin);for(const account of candidates)await storage.manageIdentity(account.username,actor,'request');}
    finally{await storage.close();}
  }
  console.log(`Sample accounts verified; ${candidates.length} pending signer requests prepared. Existing accounts and disabled signers retained.`);
}
async function upload(lotId,token){const form=new FormData();form.append('document',new Blob(['%PDF-1.4\nTraceChain sample certificate\n%%EOF'],{type:'application/pdf'}),'chung-nhan-thu-hoach.pdf');form.append('lotId',lotId);return request('/documents',token,{method:'POST',body:form});}
async function record(lotId,type,token,data){return request(`/lots/${lotId}/${type}`,token,json('POST',data));}
async function event(lot,type,token,data={}){const endpoint=['CTE_HANDOVER_PROCESSOR','CTE_HANDOVER_SHIP','CTE_HANDOVER_RETAIL'].includes(type)?'handover/request':['CTE_RECEIVE_PROCESSOR','CTE_RECEIVE_SHIP','CTE_DISPATCH_RETAIL'].includes(type)?'handover/confirm':type==='CTE_RECALL'?'recall':'events';return request(`/lots/${lot.lotId}/${endpoint}`,token,json('POST',{eventType:type,location:data.location||'Trung tâm vận hành TraceChain',previousEventId:lot.lastEventId,...data}));}

async function seedLots(){
  const tokens=Object.fromEntries(await Promise.all(users.map(async user=>[user.username,await login(user.username)])));
  const admin=await login(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD),businesses=await request('/business-organizations',admin),org=Object.fromEntries(businesses.map(item=>[item.code,item]));
  const summaries=[];
  for(const sample of lots){
    const farmer=tokens[sample.farmer];let lot;
    try{lot=await request(`/lots/${sample.lotId}`,admin);console.log(`Preserved existing lot ${lot.lotId}`);continue;}catch(error){if(!/not found|404/i.test(error.message))throw error;lot=await request('/lots',farmer,json('POST',{...sample,location:sample.origin,regionCode:'TG-001',processorOrganizationId:org['PROC-TIEN-GIANG'].organizationId,distributorOrganizationId:org['DIST-SAI-GON'].organizationId}));await record(lot.lotId,'cultivation-logs',farmer,{occurredAt:'2026-11-06T08:00:00Z',activity:'Theo dõi sinh trưởng và kiểm tra sâu bệnh',note:'Nhật ký mẫu VietGAP'});}
    if(lot.schemaVersion!==4){console.log(`Preserved historical lot ${lot.lotId}; use a new lot ID for v4.`);continue;}
    if(sample.steps==='recall'){if(lot.status==='CREATED')lot=await event(lot,'CTE_HARVEST',farmer,{location:'Điểm thu hoạch An Phú',data:{quantity:100,unit:'kg'}});if(lot.status!=='RECALLED')lot=await event(lot,'CTE_RECALL',farmer,{location:'Khu cách ly chất lượng',data:{note:'Kiểm nghiệm dư lượng bổ sung'}});await record(lot.lotId,'incidents',farmer,{occurredAt:'2026-11-06T08:00:00Z',type:'QUALITY_ALERT',description:'Lô được cách ly chủ động để kiểm nghiệm bổ sung'});summaries.push({lotId:lot.lotId,status:lot.status});continue;}
    if(sample.steps>=1&&lot.status==='CREATED'){const document=await upload(lot.lotId,farmer);lot=await event(lot,'CTE_HARVEST',farmer,{location:'Điểm thu hoạch đạt VietGAP',data:{quantity:100,unit:'kg',documentHash:document.fileHash,note:'Thu hoạch đúng độ chín'}});}
    if(sample.steps>=2&&lot.status==='HARVESTED'){lot=await event(lot,'CTE_HANDOVER_PROCESSOR',farmer,{toOrganizationId:org['PROC-TIEN-GIANG'].organizationId,toRegion:'TG-001'});lot=await event(lot,'CTE_RECEIVE_PROCESSOR',tokens['demo-processor']);lot=await event(lot,'CTE_PROCESS',tokens['demo-processor'],{location:'Trung tâm Sơ chế Tiền Giang',data:{quantity:95,unit:'kg',qualityResult:'PASS',note:'Rửa, phân loại và đóng gói'}});await record(lot.lotId,'quality-checks',tokens['demo-processor'],{occurredAt:'2026-11-06T09:00:00Z',result:'PASS',note:'Đạt tiêu chuẩn xuất kho'});}
    if(sample.steps>=3&&lot.status==='PROCESSED')lot=await event(lot,'CTE_HANDOVER_SHIP',tokens['demo-processor'],{location:'Kho sơ chế Tiền Giang',toOrg:'Org2MSP',toRegion:'TG-001',toOrganizationId:org['LOG-MIEN-TAY'].organizationId,data:{toOrganizationId:org['LOG-MIEN-TAY'].organizationId,note:'Bàn giao xe lạnh TC-68A'}});
    if(sample.steps>=4&&lot.status==='WAITING_SHIP'){lot=await event(lot,'CTE_RECEIVE_SHIP',tokens['demo-transporter'],{location:'Trạm vận tải lạnh Cần Thơ'});await record(lot.lotId,'transport-logs',tokens['demo-transporter'],{occurredAt:'2026-11-06T10:00:00Z',location:'QL1A, Cần Thơ → TP.HCM',temperature:8.2,humidity:72,note:'Chuỗi lạnh ổn định'});}
    if(sample.steps>=5&&lot.status==='IN_TRANSIT'){lot=await event(lot,'CTE_HANDOVER_RETAIL',tokens['demo-transporter'],{toOrganizationId:org['DIST-SAI-GON'].organizationId,toRegion:'TG-001'});lot=await event(lot,'CTE_DISPATCH_RETAIL',tokens['demo-distributor'],{location:'Kho phân phối Sài Gòn Fresh',data:{quantity:95,unit:'kg'}});}
    if(sample.steps>=6&&lot.status==='IN_RETAIL')lot=await event(lot,'CTE_DISPLAY_SALE',tokens['demo-distributor'],{location:'Siêu thị Sài Gòn Fresh - Thủ Đức',data:{qualityResult:'PASS'}});
    summaries.push({lotId:lot.lotId,status:lot.status,eventCount:lot.events?.length});
  }
  console.log(JSON.stringify(summaries,null,2));
}
async function main(){if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD||!password||password.length<8)throw new Error('Set ADMIN_USERNAME, ADMIN_PASSWORD and DEMO_PASSWORD (at least 8 characters)');await request('/health');if(phase!=='lots')await seedAccounts();if(phase!=='accounts')await seedLots();}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
