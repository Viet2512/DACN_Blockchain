import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {hasPermission} from '../../utils/permissions';
import { api, ApiError } from '../../services/api';
import type { Lot, User } from '../../types';
import { DataTable, ErrorState, QueryState, Pagination } from '../../components/Common';

const modules = {
  'cultivation-logs': {label: 'Nhật ký canh tác', roles: ['FARMER'], fields: {activity: 'Hoạt động canh tác'}},
  'quality-checks': {label: 'Kiểm tra chất lượng', roles: ['PROCESSOR'], fields: {result: 'Kết quả'}},
  'transport-logs': {label: 'Nhật ký vận chuyển', roles: ['TRANSPORTER'], fields: {location: 'Vị trí', temperature: 'Nhiệt độ (°C)', humidity: 'Độ ẩm (%)'}},
  incidents: {label: 'Sự cố', roles: ['FARMER', 'PROCESSOR', 'TRANSPORTER', 'DISTRIBUTOR'], fields: {type: 'Loại sự cố', description: 'Mô tả'}},
};
const recordHints: Record<string, string> = {
  activity: 'Chọn hoạt động gợi ý hoặc nhập công việc đã thực hiện.',
  location: 'Ghi rõ kho/trạm và địa phương nơi ghi nhận số đo.',
  temperature: 'Nhập số đo thực tế theo °C; có thể âm hoặc bằng 0.',
  humidity: 'Nhập số đo thực tế từ 0 đến 100%.',
  type: 'Chọn nhóm sự cố gợi ý hoặc nhập loại khác.',
  description: 'Mô tả điều phát hiện được, ảnh hưởng đến hàng và cách xử lý.',
  result: 'Chọn kết quả kiểm tra thực tế, không mặc định là đạt.',
};
const recordExamples: Record<string, string> = {activity:'VD: Kiểm tra sâu bệnh',location:'VD: Kho lạnh Cần Thơ',temperature:'VD: 8.5',humidity:'VD: 70',type:'VD: Bao bì',description:'VD: Phát hiện 2 kiện rách, đã tách riêng để kiểm tra.'};
type Module = keyof typeof modules;
interface RecordEntry {id: string; occurredAt: string; data: Record<string, unknown>; createdBy: string;}
export default function LotRecords({lot, user}: {lot: Lot; user: User}) {
  const [type, setType] = useState<Module>(user.role === 'PROCESSOR' ? 'quality-checks' : user.role === 'TRANSPORTER' ? 'transport-logs' : user.role === 'DISTRIBUTOR' ? 'incidents' : 'cultivation-logs');
  const [page, setPage] = useState(1);
  const [success, setSuccess] = useState('');
  const client = useQueryClient();
  const path = `/lots/${encodeURIComponent(lot.lotId)}/${type}`;
  const query = useQuery({queryKey: ['lot-records', lot.lotId, type, page], queryFn: async () => (await api.get<{items: RecordEntry[]; total: number}>(path, {params: {page, size: 10}})).data});
  const mutation = useMutation({mutationFn: async (input: Record<string, unknown>) => api.post(path, input), onSuccess: async () => {setSuccess('Đã lưu hồ sơ ngoài blockchain. Trạng thái hành trình không thay đổi.'); await client.invalidateQueries({queryKey: ['lot-records', lot.lotId]});}});
  const module = modules[type];
  const uncertain = mutation.error instanceof ApiError && mutation.error.uncertain;
  const writePermission = type === 'cultivation-logs' ? 'LOT_HARVEST' : type === 'quality-checks' ? 'LOT_PROCESS' : type === 'transport-logs' ? 'HANDOVER_CONFIRM' : 'LOT_RECALL';
  const expectedOrg = type === 'cultivation-logs' ? lot.ownerOrganizationId : type === 'quality-checks' ? lot.processorOrganizationId : type === 'transport-logs' ? lot.currentHolderOrganizationId : user.organizationId;
  const canWrite = !!user.organizationId && user.organizationId === expectedOrg && hasPermission(user,writePermission) && (module.roles as readonly string[]).includes(user.role) && (lot.status !== 'RECALLED' || type === 'incidents') && (type !== 'transport-logs' || lot.status === 'IN_TRANSIT');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (mutation.isPending) return;
    const form = event.currentTarget;
    const values: Record<string, unknown> = Object.fromEntries(new FormData(form));
    values.occurredAt = new Date(String(values.occurredAt)).toISOString();
    for (const field of ['temperature', 'humidity']) if (values[field] !== undefined) {if (values[field] === '') delete values[field]; else values[field] = Number(values[field]);}
    mutation.mutate(values, {onSuccess: () => form.reset()});
  }
  return <section className="panel">
    <h2>Hồ sơ bổ sung</h2>
    <p className="muted">Hồ sơ lưu ngoài blockchain, không thay thế các bước xác nhận trong hành trình lô.</p>
    <label>Loại hồ sơ<select value={type} onChange={event => {setType(event.target.value as Module); setPage(1); setSuccess(''); mutation.reset();}} disabled={mutation.isPending}>
      {Object.entries(modules).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
    </select></label>
    <QueryState pending={query.isPending} error={query.error} retry={() => void query.refetch()} />
    {query.data && <><DataTable paginate={false} rows={query.data.items} rowKey={item => item.id} columns={[
      {label: 'Thời gian', render: item => new Date(item.occurredAt).toLocaleString('vi-VN')},
      {label: 'Nội dung', render: item => <dl className="event-facts">{Object.entries(item.data).map(([key,value]) => <div key={key}><dt>{({activity:"Hoạt động",result:"Kết quả",location:"Vị trí",temperature:"Nhiệt độ (°C)",humidity:"Độ ẩm (%)",type:"Loại sự cố",description:"Mô tả",note:"Ghi chú"} as Record<string,string>)[key] || key}</dt><dd>{key === "result" ? ({PASS:"Đạt",FAIL:"Không đạt",PENDING:"Chờ kết quả"} as Record<string,string>)[String(value)] || String(value) : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>},
      {label: 'Người ghi', render: item => item.createdBy},
    ]} /><Pagination total={query.data.total} page={page} setPage={setPage} /></>}
    {canWrite && <form onSubmit={submit} className="form-grid">
      <fieldset disabled={mutation.isPending || uncertain}>
        <legend>Thêm {module.label.toLowerCase()}</legend>
        <label>Thời điểm<input name="occurredAt" type="datetime-local" required aria-describedby="record-time-hint" /></label>
        <small id="record-time-hint">Chọn ngày giờ thực tế xảy ra hoạt động/sự cố, không nhất thiết là lúc nhập hồ sơ.</small>
        {Object.entries(module.fields).map(([key, label]) => <div key={key}><label>{label}{key === 'result' ? <select name={key} required defaultValue="" aria-describedby={`record-${key}-hint`}><option value="">Chọn kết quả thực tế</option><option value="PASS">Đạt</option><option value="FAIL">Không đạt</option><option value="PENDING">Chờ kết quả</option></select> : <input name={key} maxLength={2000} placeholder={recordExamples[key]} aria-describedby={`record-${key}-hint`} list={['activity','type','location'].includes(key)?`record-${key}-suggestions`:undefined} type={['temperature', 'humidity'].includes(key) ? 'number' : 'text'} step="any" min={key === 'humidity' ? 0 : undefined} max={key === 'humidity' ? 100 : undefined} required={!['temperature', 'humidity'].includes(key)} />}</label><small id={`record-${key}-hint`}>{recordHints[key]}</small></div>)}
        <datalist id="record-activity-suggestions">{['Tưới nước','Bón phân','Kiểm tra sâu bệnh','Tỉa cành'].map(value=><option key={value} value={value}/>)}</datalist>
        <datalist id="record-type-suggestions">{['Chất lượng','Nhiệt độ bảo quản','Bao bì','Chậm giao hàng'].map(value=><option key={value} value={value}/>)}</datalist>
        <datalist id="record-location-suggestions">{[...new Set([lot.origin,...(lot.events || []).map(event=>event.location)].filter(Boolean))].map(value=><option key={value} value={value}/>)}</datalist>
        <label>Ghi chú<textarea name="note" maxLength={2000} placeholder="Thông tin bổ sung nếu có: cách thực hiện, thiết bị đo hoặc xử lý tiếp theo." /></label>
        <button type="submit">{mutation.isPending ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
      </fieldset>
    </form>}
    {mutation.error && <ErrorState error={mutation.error} />}{uncertain && <button className="secondary" onClick={() => void query.refetch()}>Đối chiếu danh sách sau lỗi</button>}{success && <p role="status" className="success">{success}</p>}
  </section>;
}
