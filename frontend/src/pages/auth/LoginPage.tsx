import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { homeFor } from "../../utils/permissions";
import { ErrorState, LoadingSkeleton } from "../../components/Common";
export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (auth.loading) return <LoadingSkeleton />;
  if (auth.user) return <Navigate to={homeFor(auth.user)} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const user = await auth.login({ username: username.trim(), password });
      const from: unknown = location.state?.from;
      navigate(
        typeof from === "string" &&
          from.startsWith("/") &&
          !from.startsWith("//") &&
          from !== "/login"
          ? from
          : homeFor(user),
        { replace: true },
      );
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" to="/trace">
          TRACE<span>CHAIN</span>
        </Link>
        <p className="eyebrow">TỪ NÔNG TRẠI ĐẾN NGƯỜI TIÊU DÙNG</p>
        <h1>
          Mỗi lô hàng.
          <br />
          Một hành trình
          <br />
          minh bạch.
        </h1>
        <p>
          Theo dõi sản xuất, bàn giao và truy xuất hành trình nông sản.
        </p>
        <div className="chain-steps">
          <span>
            01
            <br />
            Sản xuất
          </span>
          <span>
            02
            <br />
            Sơ chế
          </span>
          <span>
            03
            <br />
            Vận chuyển
          </span>
          <span>
            04
            <br />
            Phân phối
          </span>
        </div>
      </section>
      <section className="auth-card">
        <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
        <h2>Đăng nhập tác nhân</h2>
        <p className="muted">Sử dụng tài khoản được quản trị viên cấp.</p>
        {error && <ErrorState error={error} />}
        <form onSubmit={submit}>
          <label>
            Tên đăng nhập
            <input
              required
              autoComplete="username"
              maxLength={80}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Mật khẩu
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={busy || !username.trim() || !password}>
            {busy ? "Đang xác thực…" : "Đăng nhập →"}
          </button>
        </form>
        <p className="public-link">
          <Link to="/trace">Tra cứu không cần đăng nhập</Link>
        </p>
        <small>Quên mật khẩu? Liên hệ quản trị viên để đặt lại.</small>
      </section>
    </main>
  );
}
