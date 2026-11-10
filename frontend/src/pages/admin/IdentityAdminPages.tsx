import {useState,type FormEvent} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Link,useSearchParams} from 'react-router-dom';
import {adminService} from '../../services/api';
import {DataTable,PageHeader,QueryState,ErrorState,Modal} from '../../components/Common';
import {useAuth} from '../../context/AuthContext';
import {hasPermission,roleLabels,permissionLabels} from '../../utils/permissions';
import type {Organization,Role} from '../../types';
export const businessTypes = {FARM:{label:'Nông hộ',msp:'Org1MSP',role:'FARMER'},PROCESSING_FACILITY:{label:'Cơ sở sơ chế',msp:'Org1MSP',role:'PROCESSOR'},LOGISTICS_COMPANY:{label:'Công ty vận chuyển',msp:'Org2MSP',role:'TRANSPORTER'},DISTRIBUTION_COMPANY:{label:'Công ty phân phối',msp:'Org3MSP',role:'DISTRIBUTOR'}};
const blank = {code:'',name:'',type:'FARM',mspId:'Org1MSP',status:'ACTIVE',address:'',email:'',phone:''};
export function BusinessOrganizationsPage() {
  const {user} = useAuth(); const client=useQueryClient();
  const query=useQuery({queryKey:['organizations'],queryFn:adminService.organizations});
  const [search,setSearch]=useState(''),[msp,setMsp]=useState('');
  const [editing,setEditing]=useState<Organization|null|undefined>(undefined);
  const [form,setForm]=useState(blank);
  const mutation=useMutation({mutationFn:()=>adminService.saveOrganization(form,editing ? String(editing.organizationId):undefined),onSuccess:async()=>{setEditing(undefined);await client.invalidateQueries();}});
  function open(org:Organization|null) {setEditing(org);setForm(org ? {...blank,...org,type:org.type || 'FARM',code:org.code || ''}:blank);mutation.reset();}
  function submit(event:FormEvent) {event.preventDefault();if (!mutation.isPending) mutation.mutate();}
  return <><PageHeader title="Doanh nghiệp" description="Các đơn vị tham gia sản xuất, sơ chế, vận chuyển và phân phối.">
    {user && hasPermission(user,'ORGANIZATION_CREATE') && <button onClick={()=>open(null)}>+ Thêm doanh nghiệp</button>}
  </PageHeader><section className="filters"><label>Tìm doanh nghiệp<input value={search} onChange={event=>setSearch(event.target.value)}/></label><label>Fabric MSP<select value={msp} onChange={event=>setMsp(event.target.value)}><option value="">Tất cả</option>{['Org1MSP','Org2MSP','Org3MSP'].map(id=><option key={id}>{id}</option>)}</select></label></section>
  <QueryState pending={query.isPending} error={query.error} retry={()=>void query.refetch()}/>
  {query.data && <DataTable rows={query.data.filter(org=>(!msp || org.mspId===msp) && `${org.name} ${org.code}`.toLowerCase().includes(search.toLowerCase()))} rowKey={org=>org.organizationId} columns={[
    {label:'Doanh nghiệp',render:org=><>{org.name}<small>{org.code}</small></>},
    {label:'Loại / MSP',render:org=><>{businessTypes[org.type as keyof typeof businessTypes]?.label || org.type}<small>{org.mspId}</small></>},
    {label:'Trạng thái',render:org=>org.status==='ACTIVE'?'Hoạt động':'Đã vô hiệu hóa'},
    {label:'Người dùng / Lô',render:org=><><Link to={`/admin/users?organizationId=${org.organizationId}`}>{org.userCount ?? 0} tài khoản</Link><small><Link to={`/lots?organizationId=${org.organizationId}`}>Xem lô liên quan</Link></small></>},
    {label:'Thao tác',render:org=>user && hasPermission(user,'ORGANIZATION_UPDATE') ? <button className="secondary" onClick={()=>open(org)}>Chỉnh sửa</button>:'Chỉ đọc'},
  ]}/>}
  {editing!==undefined && <Modal title={editing?'Chỉnh sửa doanh nghiệp':'Thêm doanh nghiệp'} busy={mutation.isPending} onClose={()=>setEditing(undefined)}><form onSubmit={submit}><fieldset disabled={mutation.isPending}>
    <label>Mã doanh nghiệp<input required maxLength={80} placeholder="VD: FARM-MEKONG" value={form.code} onChange={event=>setForm({...form,code:event.target.value})}/></label>
    <label>Tên doanh nghiệp<input required maxLength={255} placeholder="VD: Nông trại Mekong Xanh" value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
    <label>Loại doanh nghiệp<select value={form.type} onChange={event=>setForm({...form,type:event.target.value,mspId:businessTypes[event.target.value as keyof typeof businessTypes].msp})}>{Object.entries(businessTypes).map(([key,entry])=><option key={key} value={key}>{entry.label}</option>)}</select></label>
    <label>MSP phù hợp<input readOnly value={form.mspId}/></label>
    {(['address','email','phone'] as const).map((key,index)=><label key={key}>{['Địa chỉ','Email','Điện thoại'][index]}<input type={key==='email'?'email':'text'} maxLength={key==='phone'?40:key==='address'?500:255} placeholder={key==='address'?'VD: Cái Bè, Tiền Giang':key==='email'?'VD: lienhe@example.com':'VD: 0901234567'} value={form[key] || ''} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>)}
    <label>Trạng thái<select value={form.status} onChange={event=>setForm({...form,status:event.target.value})}><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Vô hiệu hóa</option></select></label>
    {editing && editing.status!==form.status && <label className="checkbox"><input type="checkbox" required/>Tôi xác nhận thay đổi trạng thái và thu hồi các phiên của người dùng trong doanh nghiệp.</label>}
    <p className="notice">Không tạo peer hay thay đổi channel. Đổi MSP/loại khi đã có người dùng sẽ bị từ chối.</p>
    {mutation.error && <ErrorState error={mutation.error}/>}<button disabled={mutation.isPending}>{mutation.isPending?'Đang lưu…':'Lưu doanh nghiệp'}</button>
  </fieldset></form></Modal>}</>;
}
export function FabricOrganizationsPage() {
  const query=useQuery({queryKey:['fabric-organizations'],queryFn:adminService.fabricOrganizations});
  return <><PageHeader title="Tổ chức Fabric" description="Các MSP hiện có trong mạng. Không tạo peer hoặc thêm thành viên channel từ ứng dụng."/><QueryState pending={query.isPending} error={query.error}/>{query.data && !query.error && <DataTable rows={query.data} rowKey={row=>row.id} columns={[
    {label:'MSP',render:row=>row.mspId},{label:'Tên',render:row=>row.name},{label:'Trạng thái',render:row=>({ACTIVE:'Hoạt động',DISABLED:'Backend đã ngừng ký',INACTIVE:'Vô hiệu hóa',PENDING:'Chờ cấp chứng thư',REVOKED:'Đã thu hồi'} as Record<string,string>)[row.status] || 'Chưa xác định'},{label:'Doanh nghiệp',render:row=><Link to="/admin/organizations">{row.businessCount} doanh nghiệp</Link>},
  ]}/>}</>;
}
export function PermissionMatrixPage() {
  const query=useQuery({queryKey:['permissions'],queryFn:adminService.permissions});
  return <><PageHeader title="Ma trận phân quyền" description="Quyền được trả từ Backend; SUPER_ADMIN không có quyền ghi CTE. Ma trận thay đổi trên ứng dụng không thay thế quy tắc chaincode."/><QueryState pending={query.isPending} error={query.error}/>{query.data && <DataTable rows={query.data.permissions} rowKey={row=>row.code} columns={[{label:'Quyền',render:row=><>{permissionLabels[row.code] || row.description || "Quyền khác"}<details><summary>Mã quyền</summary><code>{row.code}</code></details></>},...query.data.roles.map(role=>({label:roleLabels[role.code as Role] || role.name,render:(row:{code:string})=>query.data!.grants.some(grant=>grant.role===role.code && grant.permission===row.code)?'Có quyền':'—'}))]}/>}</>;
}
export function FabricIdentitiesPage() {
  const [params]=useSearchParams();
  const {user}=useAuth();
  const client=useQueryClient();
  const userId=params.get('userId');
  const query=useQuery({queryKey:['fabric-identities'],queryFn:adminService.identities});
  const requests=useQuery({queryKey:['identity-requests'],queryFn:adminService.identityRequests,refetchInterval:query=>query.state.data?.some(row=>row.status==='APPROVED')?2000:false});
  const issue=useMutation({mutationFn:(username:string)=>adminService.identity(username,'issue'),onSuccess:async()=>{await client.invalidateQueries({queryKey:['identity-requests']});await client.invalidateQueries({queryKey:['fabric-identities']});}});
  return <><PageHeader title="Danh tính Fabric theo người dùng" description="Backend cấp certificate theo User ID, doanh nghiệp, role và MSP đã xác thực; private key và quyền CA không được trả về trình duyệt."/><section className="panel"><h2>Yêu cầu cấp chứng thư</h2><p>Business Admin chỉ xử lý nhân viên đúng doanh nghiệp; System Admin xử lý yêu cầu toàn hệ thống. Môi trường phải bật CA operator.</p><QueryState pending={requests.isPending} error={requests.error}/>{issue.error && <ErrorState error={issue.error}/>} {requests.data && <DataTable rows={requests.data.filter(row=>(!userId || row.userId===userId) && !['ISSUED','DISABLED'].includes(row.status))} rowKey={row=>row.userId} columns={[{label:'Tài khoản',render:row=><>{row.username}<small>{row.organizationName} · {row.role}</small></>},{label:'Trạng thái',render:row=>({PENDING:'Chờ quản trị viên duyệt',APPROVED:'CA operator đang cấp',FAILED:'Cấp thất bại — có thể thử lại'} as Record<string,string>)[row.status] || row.status},{label:'Thao tác',render:row=>user && hasPermission(user,'IDENTITY_ISSUE') && ['PENDING','FAILED'].includes(row.status)?<button disabled={issue.isPending} onClick={()=>issue.mutate(row.username)}>{issue.isPending?'Đang duyệt…':row.status==='FAILED'?'Thử cấp lại':'Cấp chứng thư'}</button>:'Đang xử lý'}]}/>}</section>{userId && <p>User ID: <code>{userId}</code> · <Link to="/admin/fabric-identities">Xem tất cả danh tính</Link></p>}<QueryState pending={query.isPending} error={query.error}/>{query.data && !query.error && <DataTable rows={query.data.filter(row=>!userId || row.userId===userId)} rowKey={row=>row.id} columns={[
    {label:'Người dùng',render:row=><>{row.username}<small>{row.userId}</small></>},{label:'Doanh nghiệp / MSP',render:row=><>{row.organizationName}<small>{row.mspId} · {row.role}</small></>},{label:'Enrollment',render:row=><code>{row.enrollmentId}</code>},{label:'Trạng thái certificate',render:row=>({ACTIVE:'Hoạt động',DISABLED:'Backend đã ngừng ký',INACTIVE:'Vô hiệu hóa',PENDING:'Chờ cấp chứng thư',REVOKED:'Đã thu hồi'} as Record<string,string>)[row.status] || 'Chưa xác định'},{label:'Fingerprint SHA-256',render:row=><code>{row.fingerprint}</code>},
  ]}/>}</>;
}
