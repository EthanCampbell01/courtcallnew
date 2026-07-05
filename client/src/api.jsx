import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const TOKEN_KEY = 'courtcall_token';

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [circuits, setCircuits] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setReady(true);
    api('/auth/me')
      .then((d) => { setUser(d.user); setCircuits(d.circuits); })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (username, pin, isRegister) => {
    const d = await api(`/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: { username, pin } });
    localStorage.setItem(TOKEN_KEY, d.token);
    setUser(d.user);
    setCircuits(d.circuits || []);
    return d;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setCircuits([]);
  }, []);

  const refreshCircuits = useCallback(async () => {
    const d = await api('/auth/me');
    setCircuits(d.circuits);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, circuits, ready, login, logout, refreshCircuits }}>
      {children}
    </AuthCtx.Provider>
  );
}
