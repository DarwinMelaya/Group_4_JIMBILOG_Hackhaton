import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link, Navigate, Outlet, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import type { StaffMe } from '@kalinga/shared';
import { ApiRequestError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { useStaffSession } from './StaffSession';

export type Membership = StaffMe['memberships'][number];

export interface StaffOutletContext {
  me: StaffMe;
  /** The clinic this screen is scoped to (from ?clinic=, else the first membership). */
  clinic: Membership;
}

export function useStaffContext(): StaffOutletContext {
  return useOutletContext<StaffOutletContext>();
}

/** Guard for every /staff page except login: redirects to the login form unless /me says there is a session. */
export function StaffGuard() {
  const { t } = useI18n();
  const { state, refresh } = useStaffSession();
  useEffect(() => {
    if (state.phase === 'unknown') void refresh();
  }, [state.phase, refresh]);

  if (state.phase === 'anonymous') return <Navigate to="/staff/login" replace />;
  if (state.phase === 'authed') return <StaffFrame me={state.me} />;
  if (state.phase === 'error') {
    return (
      <div className="booking">
        <p role="alert" className="field-error">
          {t('staff.frame.error')}
        </p>
        <p>
          <button type="button" className="btn btn--secondary" onClick={() => void refresh()}>
            {t('staff.retry')}
          </button>
        </p>
      </div>
    );
  }
  return <p role="status">{t('staff.frame.checking')}</p>;
}

function StaffFrame({ me }: { me: StaffMe }) {
  const { t } = useI18n();
  const { signOut } = useStaffSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = params.get('clinic');
  const clinic = me.memberships.find((m) => m.clinicId === wanted) ?? me.memberships[0];

  const switchClinic = (e: ChangeEvent<HTMLSelectElement>) => navigate(`/staff/requests?clinic=${encodeURIComponent(e.target.value)}`);
  const clinicQuery = clinic ? `?clinic=${encodeURIComponent(clinic.clinicId)}` : '';

  return (
    <div className="staff">
      <div className="staff-bar" role="group" aria-label={t('staff.frame.title')}>
        <p className="staff-bar__who">
          <strong>{me.user.displayName}</strong>
          {' - '}
          {t(`staff.role.${me.user.role}`)}
          {me.user.isDemo && <> <strong className="demo-chip">{t('staff.frame.demoAccount')}</strong></>}
        </p>
        {me.memberships.length > 1 ? (
          <div className="field">
            <label className="field-label" htmlFor="staff-clinic">
              {t('staff.frame.switch')}
            </label>
            <select id="staff-clinic" className="input" value={clinic?.clinicId ?? ''} onChange={switchClinic}>
              {me.memberships.map((m) => (
                <option key={m.clinicId} value={m.clinicId}>
                  {m.clinicName}
                </option>
              ))}
            </select>
          </div>
        ) : (
          clinic && (
            <p className="staff-bar__clinic">
              {t('staff.frame.clinic')}: <strong>{clinic.clinicName}</strong>
            </p>
          )
        )}
        {clinic && (
          <p className="staff-bar__role">
            {t('staff.frame.role')}: {t(`staff.role.${clinic.role}`)}
          </p>
        )}
        <nav aria-label={t('staff.frame.nav')} className="staff-bar__nav">
          {clinic && (
            <Link to={`/staff/requests${clinicQuery}`} className="btn btn--secondary">
              {t('staff.frame.navRequests')}
            </Link>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
            {t('staff.frame.signOut')}
          </button>
        </nav>
      </div>
      {clinic ? (
        <Outlet context={{ me, clinic } satisfies StaffOutletContext} />
      ) : (
        <section className="card" aria-labelledby="staff-noaccess">
          <h1 id="staff-noaccess">{t('staff.frame.noAccess.title')}</h1>
          <p>{t('staff.frame.noAccess.body')}</p>
        </section>
      )}
    </div>
  );
}

export type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'notfound' }
  | { kind: 'error' };

/**
 * Loads one staff resource into component state (not a shared cache). `load` must be referentially
 * stable (useCallback). A 401 ends the session; a 404 is "not found".
 * `reload()` re-runs the request; `setData` lets a successful decision replace the detail without another round trip.
 */
export function useStaffLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const { handleAuthError } = useStaffSession();
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setState({ kind: 'loading' });
    load(ctl.signal)
      .then((data) => {
        if (!ctl.signal.aborted) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        if (handleAuthError(err)) return;
        setState(err instanceof ApiRequestError && err.status === 404 ? { kind: 'notfound' } : { kind: 'error' });
      });
    return () => ctl.abort();
  }, [load, handleAuthError, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ kind: 'ready', data }), []);
  return { state, reload, setData };
}
