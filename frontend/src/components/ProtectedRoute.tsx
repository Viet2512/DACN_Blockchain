import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {hasPermission,isAdmin} from "../utils/permissions";
import type { Role } from "../types";
import { ErrorState, LoadingSkeleton } from "./Common";
export default function ProtectedRoute({ roles, permissions }: { roles?: Role[]; permissions?: string[] }) {
  const { user, loading, error, restore } = useAuth();
  const location = useLocation();
  const { role } = useParams();
  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState error={error} retry={() => void restore()} />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (
    (roles && !roles.includes(user.role) && !(isAdmin(user) && roles.some(role => ["ADMIN","SUPER_ADMIN"].includes(role))))
    || (permissions && !permissions.every(permission => hasPermission(user,permission))) ||
    (role && role.toUpperCase() !== user.role && !(isAdmin(user) && ["ADMIN","SUPER_ADMIN"].includes(role.toUpperCase())))
  )
    return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
