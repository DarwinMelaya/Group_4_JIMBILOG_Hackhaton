import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { StaffMe } from '@kalinga/shared';
import { ApiRequestError } from '../api/client';
import { staffLogin, staffLogout, staffMe } from '../api/staff';

/**
 * In-memory staff session. The session itself is an httpOnly cookie the page cannot read; what lives here is the identity
 * from /me and the CSRF token, in React state only. Leaving the /staff area (or signing out, or a 401) drops all of it.
 * Nothing is written to localStorage, sessionStorage, IndexedDB, cookies or the URL.
 */
export type EndReason = 'expired' | 'signedOut' | 'signoutUnconfirmed';

export type SessionState =
  | { phase: 'unknown' }
  | { phase: 'checking' }
  | { phase: 'error' }
  | { phase: 'anonymous'; reason?: EndReason }
  | { phase: 'authed'; me: StaffMe };

interface SessionApi {
  state: SessionState;
  /** Asks the server who we are (GET /me). 401 -> anonymous. */
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Call with any error from a staff request: a 401 ends the session. Returns true when it did. */
  handleAuthError: (err: unknown) => boolean;
}

const Ctx = createContext<SessionApi | null>(null);

export function useStaffSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStaffSession must be used inside the staff area');
  return v;
}

const MAX_TIMEOUT = 2_147_000_000;

/** Layout route for everything under /staff: owns the session state, renders the matched child. */
export function StaffArea() {
  return (
    <StaffSessionProvider>
      <Outlet />
    </StaffSessionProvider>
  );
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
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
      // Errors propagate to the login form; state changes only on success.
      apply({ phase: 'authed', me: await staffLogin(email, password) });
    },
    [apply],
  );

  const csrfRef = useRef<string | null>(null);
  csrfRef.current = state.phase === 'authed' ? state.me.csrfToken : null;

  const signOut = useCallback(async () => {
    const csrf = csrfRef.current;
    // Client state is cleared first and unconditionally: the screen must never keep staff data after "Sign out".
    apply({ phase: 'anonymous', reason: 'signedOut' });
    if (!csrf) return;
    try {
      await staffLogout(csrf);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return; // already gone server-side
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

  // Absolute session expiry from the server: end the session on screen when it passes.
  const expiresAt = state.phase === 'authed' ? state.me.sessionExpiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    const id = setTimeout(() => apply({ phase: 'anonymous', reason: 'expired' }), Math.min(Math.max(ms, 0), MAX_TIMEOUT));
    return () => clearTimeout(id);
  }, [expiresAt, apply]);

  const api = useMemo<SessionApi>(
    () => ({ state, refresh, signIn, signOut, handleAuthError }),
    [state, refresh, signIn, signOut, handleAuthError],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
