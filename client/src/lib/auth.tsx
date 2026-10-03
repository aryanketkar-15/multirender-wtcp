import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setCsrfToken } from './api';

export interface User {
  id: number;
  email: string;
  name: string;
  verified: boolean;
}

interface SessionPayload {
  authenticated?: boolean;
  user?: User | null;
  csrf_token?: string;
}

export type LoginOutcome =
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'unverified' }
  | { kind: 'throttled'; retryAfter: number | null }
  | { kind: 'error' };

interface AuthContextValue {
  /** `loading` until the first /api/session answer; `error` if the server could not be reached. */
  status: 'loading' | 'ready' | 'error';
  user: User | null;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const signedOut: AuthContextValue = {
  status: 'ready',
  user: null,
  login: async () => ({ kind: 'error' }),
  logout: async () => {},
  refresh: async () => {},
};

const AuthContext = createContext<AuthContextValue>(signedOut);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [user, setUser] = useState<User | null>(null);

  const apply = useCallback((data: SessionPayload) => {
    setCsrfToken(data.csrf_token ?? null);
    setUser(data.authenticated && data.user ? data.user : null);
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get<SessionPayload>('/api/session');
    if (res.ok) {
      apply(res.data);
      setStatus('ready');
    } else {
      setStatus('error');
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string): Promise<LoginOutcome> => {
      const res = await api.post<SessionPayload>('/api/login', { email, password });
      if (res.ok) {
        apply(res.data);
        return { kind: 'ok' };
      }
      if (res.status === 401) return { kind: 'invalid' };
      if (res.status === 403) return { kind: 'unverified' };
      if (res.status === 429) return { kind: 'throttled', retryAfter: null };
      return { kind: 'error' };
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await api.post('/api/logout');
    setUser(null);
    await refresh(); // a fresh anonymous session and CSRF token for the next sign-in
  }, [refresh]);

  const value = useMemo(
    () => ({ status, user, login, logout, refresh }),
    [status, user, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
