import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return <nav className="navbar">
    <Link className="brand" to="/dashboard">TRACE<span>CHAIN</span></Link>
    <div className="nav-links"><Link to="/dashboard">Dashboard</Link><Link to="/trace/demo">Tra cứu công khai</Link>{user?.role === 'ADMIN' && <Link to="/admin/users">Phân quyền</Link>}
      {user && <><span className="identity">{user.actorId} · {user.role}</span><button className="link-button" onClick={() => { logout(); navigate('/login'); }}>Đăng xuất</button></>}
    </div>
  </nav>;
}
