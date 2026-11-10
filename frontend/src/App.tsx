import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./components/DashboardLayout";
import { ErrorBoundary } from "./components/Common";
import ActivationPage from "./pages/auth/ActivationPage";
import BusinessPage from "./pages/shared/BusinessPage";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import LotsPage from "./pages/lots/LotsPage";
import CreateLotPage from "./pages/lots/CreateLotPage";
import LotDetailPage from "./pages/lots/LotDetailPage";
import TracePublicPage from "./pages/public/TracePublicPage";
import HistoryPage from "./pages/shared/HistoryPage";
import ProfilePage from "./pages/shared/ProfilePage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import {
  AuditPage,
  BlockchainPage,
  ReportsPage,
  VerificationPage,
} from "./pages/admin/AdminPages";
import {BusinessOrganizationsPage as OrganizationsPage, PermissionMatrixPage as RolesPage, FabricOrganizationsPage, FabricIdentitiesPage} from './pages/admin/IdentityAdminPages';
import { homeFor } from "./utils/permissions";
import "./App.css";
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user) : "/login"} replace />;
}
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/activate" element={<ActivationPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/trace" element={<TracePublicPage />} />
            <Route path="/trace/:lotId" element={<TracePublicPage />} />
            <Route
              path="/unauthorized"
              element={
                <main className="page">
                  <h1>Không có quyền truy cập</h1>
                  <p>Vai trò tài khoản không có quyền truy cập trang này.</p>
                  <Link to="/dashboard">Về trang của bạn</Link>
                </main>
              }
            />
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route index element={<HomeRedirect />} />
                <Route path="/dashboard" element={<HomeRedirect />} />
                <Route path="/:role/dashboard" element={<ProtectedRoute permissions={["LOT_READ"]} />}>
                  <Route index element={<DashboardPage />} />
                </Route>
                <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route path="/lots" element={<LotsPage />} /><Route path="/work" element={<LotsPage mode="work" />} /></Route>
                <Route element={<ProtectedRoute roles={["FARMER"]} permissions={["LOT_CREATE"]} />}>
                  <Route path="/lots/new" element={<CreateLotPage />} />
                </Route>
                <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route path="/lots/:lotId" element={<LotDetailPage />} /></Route>
                <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route
                  path="/handovers"
                  element={<LotsPage mode="handovers" />}
                /></Route>
                <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route path="/recalls" element={<LotsPage mode="recalls" />} /></Route>
                <Route element={<ProtectedRoute permissions={["LOT_READ", "TRACE_HISTORY_READ"]} />}><Route path="/history" element={<HistoryPage />} /></Route>
                <Route element={<ProtectedRoute roles={["BUSINESS_ADMIN"]} />}>
                  <Route path="/business/staff" element={<AdminUsersPage />} />
                  <Route path="/business/activity" element={<BusinessPage />} />
                  <Route path="/business/organization" element={<BusinessPage organization />} />
                </Route>
                <Route path="/profile" element={<ProfilePage />} />
                <Route element={<ProtectedRoute roles={["SUPER_ADMIN","ADMIN"]} />}>
                  <Route element={<ProtectedRoute permissions={["USER_READ"]} />}><Route path="/admin/users" element={<AdminUsersPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["ORGANIZATION_READ"]} />}><Route path="/admin/fabric-organizations" element={<FabricOrganizationsPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["BLOCKCHAIN_MONITOR"]} />}><Route path="/admin/fabric-identities" element={<FabricIdentitiesPage />} /></Route>
                  <Route path="/admin/actors" element={<Navigate to="/admin/users" replace />} />
                  <Route element={<ProtectedRoute permissions={["ORGANIZATION_READ"]} />}><Route
                    path="/admin/organizations"
                    element={<OrganizationsPage />}
                  /></Route>
                  <Route element={<ProtectedRoute permissions={["USER_READ"]} />}><Route path="/admin/roles" element={<RolesPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route path="/admin/lots" element={<LotsPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ", "TRACE_HISTORY_READ"]} />}><Route path="/admin/events" element={<HistoryPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ", "TRACE_HISTORY_READ"]} />}><Route
                    path="/admin/handovers"
                    element={<HistoryPage handovers />}
                  /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ", "TRACE_HISTORY_READ"]} />}><Route
                    path="/admin/recalls"
                    element={<HistoryPage recalls />}
                  /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ", "TRACE_VALIDATE"]} />}><Route
                    path="/admin/verification"
                    element={<VerificationPage />}
                  /></Route>
                  <Route element={<ProtectedRoute permissions={["BLOCKCHAIN_MONITOR"]} />}><Route
                    path="/admin/blockchain"
                    element={<BlockchainPage />}
                  /></Route>
                  <Route element={<ProtectedRoute permissions={["AUDIT_LOG_READ"]} />}><Route path="/admin/audit-logs" element={<AuditPage />} /></Route>
                  <Route element={<ProtectedRoute permissions={["LOT_READ"]} />}><Route path="/admin/reports" element={<ReportsPage />} /></Route>
                </Route>
              </Route>
            </Route>
            <Route
              path="*"
              element={
                <main className="page">
                  <h1>Không tìm thấy trang</h1>
                  <Link to="/dashboard">Về trang chủ</Link> ·{" "}
                  <Link to="/trace">Tra cứu công khai</Link>
                </main>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
