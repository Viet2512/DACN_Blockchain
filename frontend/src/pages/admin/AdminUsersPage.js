import { useEffect, useState } from 'react';
import { actorService, authService } from '../../services/api';

const initialForm = { username: '', password: '', actorId: '', orgMsp: 'Org1MSP', role: 'FARMER' };
const roleOrganizations = {
  FARMER: 'Org1MSP',
  PROCESSOR: 'Org1MSP',
  TRANSPORTER: 'Org2MSP',
  DISTRIBUTOR: 'Org3MSP',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actors, setActors] = useState([]);
  const [audit, setAudit] = useState([]);
  const updateRole = (role) => setForm({...form, role, orgMsp: roleOrganizations[role] || form.orgMsp});

  const loadUsers = async () => {
    try { setUsers(await authService.users()); } catch (e) { setError(e.message); }
  };
  useEffect(() => {
    loadUsers();
    actorService.list().then(setActors).catch((e) => setError(e.message));
    authService.audit().then(setAudit).catch((e) => setError(e.message));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await authService.createUser(form);
      setForm(initialForm);
      setMessage('Đã tạo/cập nhật tài khoản thành công.');
      await loadUsers();
      setAudit(await authService.audit());
    } catch (e) { setError(e.message); }
  };

  const toggleStatus = async (user) => {
    setError('');
    try {
      await authService.setUserStatus(user.username, user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
      await loadUsers();
      setAudit(await authService.audit());
    } catch (e) { setError(e.message); }
  };

  const resetPassword = async (user) => {
    const password = window.prompt(`Mật khẩu mới cho ${user.username} (tối thiểu 6 ký tự):`);
    if (password === null) return;
    setError('');
    try {
      await authService.resetPassword(user.username, password);
      setMessage(`Đã đặt lại mật khẩu cho ${user.username}.`);
      await loadUsers();
    } catch (e) { setError(e.message); }
  };

  return <main className="page"><div className="page-heading"><div><p className="eyebrow">ADMIN · ACCESS CONTROL</p><h1>Phân quyền tác nhân</h1><p className="muted">Tạo tài khoản và gán đúng vai trò trong chuỗi cung ứng.</p></div></div>
    <section className="form-card"><h2>Tạo tài khoản</h2>{error && <div className="error">{error}</div>}{message && <div className="success">{message}</div>}
      <form onSubmit={submit}><div className="two"><label>Tên đăng nhập<input required value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} /></label><label>Mật khẩu<input required type="password" minLength="6" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} /></label></div>
        <div className="two"><label>Vai trò<select value={form.role} onChange={(e) => updateRole(e.target.value)}><option>FARMER</option><option>PROCESSOR</option><option>TRANSPORTER</option><option>DISTRIBUTOR</option><option>ADMIN</option></select></label><label>Tổ chức<select value={form.orgMsp} disabled={form.role !== 'ADMIN'} onChange={(e) => setForm({...form, orgMsp: e.target.value})}><option>Org1MSP</option><option>Org2MSP</option><option>Org3MSP</option></select></label></div>
        {form.role !== 'ADMIN' && <label>Tác nhân<select required value={form.actorId} onChange={(e) => setForm({...form, actorId: e.target.value})}><option value="">-- Chọn tác nhân --</option>{actors.filter((actor) => actor.mspId === form.orgMsp && actor.roles.includes(form.role) && actor.status === 'ACTIVE').map((actor) => <option value={actor.actorId} key={actor.actorId}>{actor.fullName} · {actor.actorId}</option>)}</select></label>}
        <button>Gán quyền</button>
      </form>
    </section>
    <section className="table-card"><h2>Danh sách tài khoản</h2><table><thead><tr><th>Tài khoản</th><th>Tác nhân</th><th>Vai trò</th><th>Tổ chức</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{users.map((user) => <tr key={user.username}><td><b>{user.username}</b></td><td>{user.displayName || user.actorId || '—'}</td><td>{user.role}</td><td>{user.orgMsp || '—'}</td><td>{user.status}</td><td><button type="button" onClick={() => toggleStatus(user)}>{user.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}</button>{' '}<button type="button" onClick={() => resetPassword(user)}>Đặt lại mật khẩu</button></td></tr>)}</tbody></table></section>
    <section className="table-card"><h2>Audit log quản trị</h2><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.auditId}><td>{new Date(entry.createdAt).toLocaleString('vi-VN')}</td><td>{entry.actorUsername}</td><td>{entry.action}</td><td>{entry.target || '—'}</td></tr>)}</tbody></table></section>
  </main>;
}
