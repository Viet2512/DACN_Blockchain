import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authService, TOKEN_KEY, ApiError } from "../services/api";
import type { User } from "../types";

type AuthValue = {
  user: User | null;
  loading: boolean;
  error: Error | null;
  restore: () => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<User>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!sessionStorage.getItem(TOKEN_KEY));
  const [error, setError] = useState<Error | null>(null);
  const clear = () => {
    setUser(null);
    setError(null);
    client.clear();
  };
  const restore = async () => {
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setUser(await authService.me());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clear();
      else
        setError(
          e instanceof Error ? e : new Error("Không thể khôi phục phiên."),
        );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // Remove legacy cached identities: role always comes from the server.
    localStorage.removeItem("tracechain-auth");
    localStorage.removeItem(TOKEN_KEY);
    void restore();
    window.addEventListener("tracechain-session-expired", clear);
    return () =>
      window.removeEventListener("tracechain-session-expired", clear);
    // Session restoration runs once; future 401 responses clear it through the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const login = async (input: { username: string; password: string }) => {
    const result = await authService.login(input);
    client.clear();
    sessionStorage.setItem(TOKEN_KEY, result.token);
    setUser(result.user);
    setError(null);
    return result.user;
  };
  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      sessionStorage.removeItem(TOKEN_KEY);
      clear();
    }
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, error, restore, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
