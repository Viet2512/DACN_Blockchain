import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import CreateLotPage from './pages/lots/CreateLotPage';
import LotDetailPage from './pages/lots/LotDetailPage';
import TracePublicPage from './pages/public/TracePublicPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminRoute from './components/AdminRoute';

function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/trace/:lotId" element={<TracePublicPage />} />
    <Route element={<><Navbar /><ProtectedRoute /></>}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/lots/new" element={<CreateLotPage />} />
      <Route path="/lots/:lotId" element={<LotDetailPage />} />
      <Route element={<AdminRoute />}><Route path="/admin/users" element={<AdminUsersPage />} /></Route>
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}

export default App;
