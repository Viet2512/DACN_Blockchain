import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeFor, roleLabels, isAdmin, hasPermission } from "../utils/permissions";
import { adminSections, navigationFor } from "../utils/navigation";
import { ErrorState } from "./Common";
export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const location = useLocation();
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); menu.current?.focus(); }
      if (event.key === "Tab") {
        const items = sidebar.current?.querySelectorAll<HTMLElement>("a, button");
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const resize = () => { if (window.innerWidth > 760) setOpen(false); };
    window.addEventListener("resize", resize);
    document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", close); window.removeEventListener("resize", resize); };
  }, [open]);
  if (!user) return null;
  const links = navigationFor(user);
  const active = (link: typeof links[number]) => (link.paths || [link.to]).includes(location.pathname);
  const section = isAdmin(user) ? adminSections.find(section => section.links.some(([to]) => to === location.pathname)) : undefined;
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">Đến nội dung chính</a>
      {open && <button className="sidebar-backdrop" aria-label="Đóng điều hướng" onClick={() => {setOpen(false); menu.current?.focus();}} />}
      <aside ref={sidebar} id="main-navigation" className={`sidebar ${open ? "is-open" : ""}`} aria-label="Thanh điều hướng">
        <Link className="brand" to={homeFor(user)} onClick={() => setOpen(false)}>TRACE<span>CHAIN</span><small>Nguồn gốc minh bạch</small></Link>
        <p className="sidebar-caption">{isAdmin(user) ? "QUẢN TRỊ HỆ THỐNG" : roleLabels[user.role].toUpperCase()}</p>
        <nav aria-label="Điều hướng chính">
          {links.map((link, index) => <Link key={link.to} to={link.to} title={link.label} className={active(link) ? "active" : ""} aria-current={active(link) ? "page" : undefined} onClick={() => setOpen(false)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/>{index === 0 ? <path d="M8 15v-3m4 3V8m4 7v-5"/> : <path d="M8 9h8M8 13h8M8 17h4"/>}</svg>
            <span className="nav-label">{link.label}</span>
          </Link>)}
        </nav>
        <div className="sidebar-bottom"><Link to="/profile" onClick={() => setOpen(false)}>Tài khoản của tôi</Link><Link to="/trace" onClick={() => setOpen(false)}>Tra cứu công khai ↗</Link></div>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <button ref={menu} className="menu-button secondary" aria-label="Mở hoặc đóng điều hướng" aria-controls="main-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
          <button className="collapse-button secondary" aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>☰</button>
          <span className="workspace-label">{isAdmin(user) ? "Quản trị hệ thống" : "Không gian làm việc"}</span>
          <Link className="header-identity" to="/profile"><b>{user.fullName || user.displayName || user.username}</b><small>{roleLabels[user.role]}{user.organizationName ? ` · ${user.organizationName}` : ""}</small></Link>
          <button className="secondary" onClick={async () => {try {await logout();} catch (e) {setError(e as Error);}}}>Đăng xuất</button>
        </header>
        <div className="breadcrumbs"><Link to={homeFor(user)}>Trang chủ</Link><span> / </span><span>{links.find(active)?.label || (location.pathname === "/profile" ? "Tài khoản của tôi" : "Chi tiết lô hàng")}</span></div>
        {error && <ErrorState error={error} />}
        <main id="main-content" className="page">
          {section && <nav className="section-tabs" aria-label={section.label}>{section.links.filter(([, , permission]) => !permission || hasPermission(user, permission)).map(([to, label]) => <NavLink end key={to} to={to}>{label}</NavLink>)}</nav>}
          <Outlet />
        </main>
        <footer className="app-footer">TraceChain · Truy xuất nguồn gốc nông sản</footer>
      </div>
    </div>
  );
}
