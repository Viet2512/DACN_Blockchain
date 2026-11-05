import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { lotService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function CreateLotPage() {
  const { user } = useAuth(); const navigate = useNavigate();
  const [form, setForm] = useState({ lotId: '', productName: '', origin: '', harvestDate: '', location: '', regionCode: user.regionCode || '' }); const [error, setError] = useState('');
  const submit = async (e) => { e.preventDefault(); try { const lot = await lotService.create({ ...form, actorId: user.actorId, actorRole: user.role }); navigate(`/lots/${lot.lotId}`); } catch (err) { setError(err.message); } };
  return <main className="page narrow"><Link className="back" to="/dashboard">← Dashboard</Link><section className="form-card"><p className="eyebrow">CTE_CREATE</p><h1>Khởi tạo lô nông sản</h1>{error && <div className="error">{error}</div>}<form onSubmit={submit}><label>Mã lô<input required value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} placeholder="LOT-2026-001" /></label><label>Tên sản phẩm<input required value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></label><div className="two"><label>Nguồn gốc<input required value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} /></label><label>Ngày thu hoạch<input required type="date" value={form.harvestDate} onChange={(e) => setForm({ ...form, harvestDate: e.target.value })} /></label></div><label>Mã vùng<select required value={form.regionCode} disabled><option value={user.regionCode}>{user.regionCode}</option></select></label><label>Vị trí / mô tả điểm ghi nhận<input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label><button>Tạo lô và ghi nhận</button></form></section></main>;
}
