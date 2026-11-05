import { useEffect, useState } from 'react';
import { lotService, uploadDocument } from '../../services/api';

const events = [['CTE_HARVEST', 'Thu hoạch', 'FARMER', 'CREATED'], ['CTE_PROCESS', 'Sơ chế / đóng gói', 'PROCESSOR', 'HARVESTED'], ['CTE_HANDOVER_SHIP', 'Yêu cầu bàn giao vận chuyển', 'PROCESSOR', 'PROCESSED'], ['CTE_RECEIVE_SHIP', 'Xác nhận nhận hàng', 'TRANSPORTER', 'WAITING_SHIP'], ['CTE_DISPATCH_RETAIL', 'Xuất kho điểm bán', 'DISTRIBUTOR', 'IN_TRANSIT'], ['CTE_DISPLAY_SALE', 'Đưa lên kệ bán', 'DISTRIBUTOR', 'IN_RETAIL'], ['CTE_RECALL', 'Cảnh báo / thu hồi', 'ANY', '*']];

export default function EventFormModal({ lot, user, onClose, onSaved }) {
  const available = events.filter(([, , role, from]) => (role === user.role || role === 'ANY') && (from === '*' || from === lot.status));
  const [form, setForm] = useState({ eventType: available[0]?.[0] || '', location: '', note: '', documentHash: '', toOrg: 'Org2MSP', toRegion: user.regionCode || '' }); const [error, setError] = useState(''); const [uploading, setUploading] = useState(false);
  useEffect(() => {
    if (!available.some(([value]) => value === form.eventType)) {
      setForm((current) => ({ ...current, eventType: available[0]?.[0] || '' }));
    }
  }, [lot.status, user.role, form.eventType, available]);
  const submit = async (e) => {
    e.preventDefault();
    const eventType = e.currentTarget.elements.eventType.value;
    if (!available.some(([value]) => value === eventType)) {
      setError(`Sự kiện ${eventType || '(trống)'} không hợp lệ với vai trò ${user.role} và trạng thái ${lot.status}.`);
      return;
    }
    try { onSaved(await lotService.addEvent(lot.lotId, { ...form, eventType, actorId: user.actorId, actorRole: user.role, previousEventId: lot.lastEventId, data: { ...(form.note ? { note: form.note } : {}), ...(form.documentHash ? { documentHash: form.documentHash } : {}), ...(eventType === 'CTE_HANDOVER_SHIP' ? {toOrg: form.toOrg, toRegion: form.toRegion} : {}) } })); } catch (err) { setError(err.message); }
  };
  const selectDocument = async (e) => { const file = e.target.files[0]; if (!file) return; setUploading(true); setError(''); try { const result = await uploadDocument(file, { lotId: lot.lotId }); setForm({ ...form, documentHash: result.fileHash }); } catch (err) { setError(err.message); } finally { setUploading(false); } };
  return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><p className="eyebrow">NEW EVENT · IESH CHECK</p><h2>Ghi nhận sự kiện</h2>{error && <div className="error">{error}</div>}<form onSubmit={submit}><label>Loại sự kiện<select name="eventType" value={form.eventType} onChange={(e) => { setError(''); setForm({ ...form, eventType: e.target.value }); }}>{available.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{form.eventType === 'CTE_HANDOVER_SHIP' && <><label>Tổ chức nhận<select value={form.toOrg} onChange={(e) => setForm({...form, toOrg: e.target.value})}><option>Org2MSP</option><option>Org3MSP</option></select></label><label>Mã vùng nhận<input required value={form.toRegion} onChange={(e) => setForm({...form, toRegion: e.target.value.toUpperCase()})} placeholder="VD: TG-001" /></label></>}<label>Vị trí<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="GPS / mã điểm" /></label><label>Ghi chú KDE<textarea required value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Nhiệt độ, số lượng, tình trạng, biên bản..." /></label><label>Chứng từ<input type="file" accept=".pdf,image/*" onChange={selectDocument} /><small>{uploading ? 'Đang lưu chứng từ và tính SHA-256...' : form.documentHash ? `Đã lưu · SHA-256: ${form.documentHash}` : 'PDF VietGAP hoặc ảnh thực tế (tối đa 5MB)'}</small></label><button disabled={uploading}>{uploading ? 'Đang tải...' : 'Ghi nhận lên sổ cái'}</button></form></section></div>;
}
