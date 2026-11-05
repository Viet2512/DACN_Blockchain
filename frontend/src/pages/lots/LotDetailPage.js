import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { lotService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import EventFormModal from '../events/EventFormModal';

const eventTransitions = {
  FARMER: { CREATED: 'CTE_HARVEST' },
  PROCESSOR: { HARVESTED: 'CTE_PROCESS', PROCESSED: 'CTE_HANDOVER_SHIP' },
  TRANSPORTER: { WAITING_SHIP: 'CTE_RECEIVE_SHIP' },
  DISTRIBUTOR: { IN_TRANSIT: 'CTE_DISPATCH_RETAIL', IN_RETAIL: 'CTE_DISPLAY_SALE' },
};

export default function LotDetailPage() {
  const { lotId } = useParams(); const { user } = useAuth(); const [lot, setLot] = useState(null); const [error, setError] = useState(''); const [validation, setValidation] = useState(null); const [showForm, setShowForm] = useState(false);
  useEffect(() => {
    let active = true;
    lotService.get(lotId)
      .then((nextLot) => { if (active) setLot(nextLot); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [lotId]);
  if (!lot) return <main className="page"><p>{error || 'Đang tải...'}</p></main>;
  const validate = async () => { try { setValidation(await lotService.validate(lotId)); } catch (e) { setError(e.message); } };
  const canRecord = user.role !== 'ADMIN' && lot.status !== 'RECALLED' && Boolean(eventTransitions[user.role]?.[lot.status]);
  return <main className="page"><Link className="back" to="/dashboard">← Dashboard</Link><div className="page-heading"><div><p className="eyebrow">LOT DETAIL · {lot.lotId}</p><h1>{lot.productName} <StatusBadge status={lot.status} /></h1><p className="muted">{lot.origin} · Bên nắm giữ: {lot.currentHolder}</p></div>{canRecord && <button onClick={() => setShowForm(true)}>+ Ghi nhận sự kiện</button>}</div>{error && <div className="error">{error}</div>}{validation && <div className={validation.valid ? 'success' : 'error'}>{validation.valid ? 'IESH hợp lệ: lịch sử nhất quán.' : `IESH phát hiện ${validation.anomalies?.length || validation.invalidHashes?.length || 1} bất thường.`}</div>}<button onClick={validate}>Kiểm tra nhất quán IESH</button>{showForm && <EventFormModal lot={lot} user={user} onClose={() => setShowForm(false)} onSaved={(next) => { setLot(next); setShowForm(false); }} />}<section className="timeline-card"><h2>Lịch sử hành trình</h2><div className="timeline">{lot.events.map((event) => <article key={event.eventId}><div className="dot" /><div><b>{event.eventType}</b><small>{new Date(event.timestamp).toLocaleString('vi-VN')} · {event.location} · {event.actorId} ({event.actorRole})</small><code>SHA-256: {event.dataHash}</code></div></article>)}</div></section><Link className="qr-link" to={`/trace/${lot.lotId}`}>Xem trang QR công khai →</Link></main>;
}
