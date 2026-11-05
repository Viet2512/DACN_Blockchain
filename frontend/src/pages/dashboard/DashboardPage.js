import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {lotService} from '../../services/api';
import {useAuth} from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';

const nextAction = {
  FARMER: {CREATED: 'Thu hoạch', HARVESTED: 'Chờ sơ chế'},
  PROCESSOR: {HARVESTED: 'Sơ chế', PROCESSED: 'Bàn giao vận chuyển'},
  TRANSPORTER: {WAITING_SHIP: 'Xác nhận nhận hàng'},
  DISTRIBUTOR: {IN_TRANSIT: 'Xuất kho điểm bán', IN_RETAIL: 'Đưa lên kệ bán'},
};

export default function DashboardPage() {
  const {user} = useAuth();
  const [lots, setLots] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { lotService.list().then(setLots).catch((e) => setError(e.message)); }, []);
  return <main className="page">
    <div className="page-heading"><div><p className="eyebrow">DASHBOARD {user.role === 'ADMIN' ? 'QUẢN TRỊ' : 'TÁC NHÂN'}</p><h1>Quản lý lô hàng</h1><p className="muted">Xin chào {user.displayName || user.username}. {user.orgMsp || 'Toàn hệ thống'} · Vùng: {user.regionCode || 'Tất cả'} · {user.role}</p></div>{user.role === 'FARMER' && <Link className="button" to="/lots/new">+ Khởi tạo lô</Link>}</div>
    {error && <div className="error">{error}</div>}
    <section className="lot-grid">{lots.map((lot) => <article className="lot-card" key={lot.lotId}>
      <div className="lot-card-top"><div><span className="lot-code">{lot.lotId}</span><h2>{lot.productName}</h2></div><StatusBadge status={lot.status}/></div>
      <p className="muted">{lot.origin}</p>
      <div className="lot-meta"><span><small>Mã vùng</small><b>{lot.regionCode || 'GLOBAL'}</b></span><span><small>Bên nắm giữ</small><b className="truncate">{lot.currentHolder}</b></span><span><small>Sự kiện</small><b>{lot.eventCount}</b></span></div>
      <div className="lot-card-footer"><span className="next-action">{nextAction[user.role]?.[lot.status] || (lot.status === 'RECALLED' ? 'Đã thu hồi - khóa' : 'Theo dõi lịch sử')}</span><Link to={`/lots/${lot.lotId}`}>Xem chi tiết →</Link></div>
    </article>)}</section>
    {lots.length === 0 && <div className="empty-card">Không có lô thuộc mã vùng <b>{user.regionCode}</b>.</div>}
  </main>;
}
