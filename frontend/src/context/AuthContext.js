import { createContext, useContext, useMemo, useState } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'tracechain-auth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
  });

  const login = async (credentials) => {
    const result = await authService.login(credentials);
    localStorage.setItem('tracechain-token', result.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result.user));
    setUser(result.user);
  };
  const logout = async () => {
    try { await authService.logout(); } finally {
      localStorage.removeItem('tracechain-token');
      localStorage.removeItem(STORAGE_KEY);
      setUser(null);
    }
  };
  const value = useMemo(() => ({ user, login, logout, isAuthenticated: Boolean(user) }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
