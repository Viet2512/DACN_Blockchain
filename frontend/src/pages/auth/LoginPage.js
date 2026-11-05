import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const [form, setForm] = useState({ username: 'admin', password: 'admin123' });
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const submit = async (event) => { event.preventDefault(); setError(''); try { await login(form); navigate(location.state?.from || '/dashboard', { replace: true }); } catch (e) { setError(e.message); } };
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">TRACECHAIN · IDENTITY</p><h1>Đăng nhập tác nhân</h1><p className="muted">Chọn danh tính mô phỏng để kiểm thử RBAC theo tổ chức Fabric.</p>
    <form onSubmit={submit}>{error && <div className="error">{error}</div>}<label>Tên đăng nhập<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
      <label>Mật khẩu<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
      <button>Vào Dashboard</button>
    </form><p className="public-link">Người tiêu dùng? <a href="/trace/demo">Tra cứu không cần đăng nhập</a></p>
  </section></main>;
}
