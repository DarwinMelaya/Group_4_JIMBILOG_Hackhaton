import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { StaffMe } from '@kalinga/shared';
import { ApiRequestError } from '../api/client';
import { staffLogin, staffLogout, staffMe } from '../api/staff';

export type EndReason = 'expired' | 'signedOut' | 'signoutUnconfirmed';

export type SessionState =
  | { phase: 'unknown' }
  | { phase: 'checking' }
  | { phase: 'error' }
  | { phase: 'anonymous'; reason?: EndReason }
  | { phase: 'authed'; me: StaffMe };

interface SessionApi {
  state: SessionState;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  handleAuthError: (err: unknown) => boolean;
  csrf?: string;
}

const Ctx = createContext<SessionApi | null>(null);

export function useAdminSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdminSession must be used inside the admin area');
  return v;
}

const MAX_TIMEOUT = 2_147_000_000;

export function AdminArea() {
  return (
    <AdminSessionProvider>
      <Outlet />
    </AdminSessionProvider>
  );
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ phase: 'unknown' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const apply = useCallback((s: SessionState) => {
    if (alive.current) setState(s);
  }, []);

  const refresh = useCallback(async () => {
    apply({ phase: 'checking' });
    try {
      apply({ phase: 'authed', me: await staffMe() });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) apply({ phase: 'anonymous' });
      else apply({ phase: 'error' });
    }
  }, [apply]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      apply({ phase: 'authed', me: await staffLogin(email, password) });
    },
    [apply],
  );

  const csrfRef = useRef<string | null>(null);
  csrfRef.current = state.phase === 'authed' ? state.me.csrfToken : null;

  const signOut = useCallback(async () => {
    const csrf = csrfRef.current;
    apply({ phase: 'anonymous', reason: 'signedOut' });
    if (!csrf) return;
    try {
      await staffLogout(csrf);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return;
      apply({ phase: 'anonymous', reason: 'signoutUnconfirmed' });
    }
  }, [apply]);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiRequestError && err.status === 401) {
        apply({ phase: 'anonymous', reason: 'expired' });
        return true;
      }
      return false;
    },
    [apply],
  );

  const expiresAt = state.phase === 'authed' ? state.me.sessionExpiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    const id = setTimeout(() => apply({ phase: 'anonymous', reason: 'expired' }), Math.min(Math.max(ms, 0), MAX_TIMEOUT));
    return () => clearTimeout(id);
  }, [expiresAt, apply]);

  const api = useMemo<SessionApi>(
    () => ({ state, refresh, signIn, signOut, handleAuthError, csrf: csrfRef.current ?? undefined }),
    [state, refresh, signIn, signOut, handleAuthError],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
