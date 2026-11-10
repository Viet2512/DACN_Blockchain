import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {adminService} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import {DataTable,PageHeader,QueryState} from '../../components/Common';
export default function BusinessPage({organization=false}:{organization?:boolean}) {
  const {user}=useAuth();
  const orgs=useQuery({queryKey:['organizations'],queryFn:adminService.organizations,enabled:organization});
  const activity=useQuery({queryKey:['business-activity'],queryFn:adminService.businessActivity,enabled:!organization});
  const own=orgs.data?.find(org=>org.organizationId===user?.organizationId);
  return <><nav className="section-tabs" aria-label="Doanh nghiệp"><Link to="/business/activity">Hoạt động</Link><Link to="/business/organization">Thông tin doanh nghiệp</Link></nav><PageHeader title={organization?'Thông tin doanh nghiệp':'Hoạt động doanh nghiệp'}/><QueryState pending={organization?orgs.isPending:activity.isPending} error={orgs.error || activity.error}/>{organization?own && <section className="panel"><h2>{own.name}</h2><dl>{[['Mã',own.code],['Loại hình',own.type],['Email',own.email],['Điện thoại',own.phone],['Địa chỉ',own.address],['Trạng thái',own.status==='ACTIVE'?'Hoạt động':'Tạm khóa']].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>:activity.data && <DataTable rows={activity.data} rowKey={row=>row.auditId} columns={[{label:'Thời gian',render:row=>new Date(row.createdAt).toLocaleString('vi-VN')},{label:'Người thực hiện',render:row=>row.actorUsername},{label:'Hoạt động',render:row=>row.action},{label:'Đối tượng',render:row=>row.target}]}/>}</>;
}
