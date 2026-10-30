import { useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { StaffRole } from '@kalinga/shared';
import { ApiRequestError } from '../api/client';
import { en, type MessageId } from '../i18n/catalog';
import { useI18n } from '../i18n/I18nProvider';
import { useAdminSession } from './AdminSession';

/** Roles that may open the admin area at all (mirrors the API: clinic_staff has no /admin/* route). */
export const ADMIN_ROLES: readonly StaffRole[] = ['provincial_admin', 'technical_admin', 'clinic_admin'];
/** Route access, mirroring the API role gates in apps/api/src/governance/routes.ts. */
export const ROLES_CLINICS: readonly StaffRole[] = ['provincial_admin', 'technical_admin'];
export const ROLES_CONTENT: readonly StaffRole[] = ['provincial_admin'];
export const ROLES_STAFF: readonly StaffRole[] = ADMIN_ROLES;
export const ROLES_MINOR: readonly StaffRole[] = ['provincial_admin', 'technical_admin'];
/** Write access (technical_admin is read-only for clinic governance and minor SOP mapping). */
export const ROLES_WRITE: readonly StaffRole[] = ['provincial_admin'];

const NAV: ReadonlyArray<{ to: string; label: MessageId; roles: readonly StaffRole[] }> = [
  { to: '/admin', label: 'admin.nav.dashboard', roles: ADMIN_ROLES },
  { to: '/admin/clinics', label: 'admin.nav.clinics', roles: ROLES_CLINICS },
  { to: '/admin/content', label: 'admin.nav.content', roles: ROLES_CONTENT },
  { to: '/admin/staff', label: 'admin.nav.staff', roles: ROLES_STAFF },
  { to: '/admin/minor-sop', label: 'admin.nav.minor', roles: ROLES_MINOR },
];

/** Label for a machine value (status, review state, evidence type). Falls back to the raw value; always rendered as text. */
export function useLabel(): (group: 'enum' | 'evidence.type', value: string) => string {
  const { t } = useI18n();
  return (group, value) => {
    const id = `admin.${group}.${value}`;
    return id in en ? t(id as MessageId) : value;
  };
}

/** Maps an API failure to a catalog id. Returns null when it was a 401 (the session layer is already redirecting to sign-in). */
export function useErrorText(): (err: unknown) => MessageId | null {
  const { handleAuthError } = useAdminSession();
  return useCallback(
    (err) => {
      if (handleAuthError(err)) return null;
      if (err instanceof ApiRequestError) {
        if (err.kind !== 'http') return 'admin.err.network';
        const byCode = `admin.err.${err.code ?? ''}`;
        if (err.code && byCode in en) return byCode as MessageId;
        if (err.status === 403) return 'admin.err.forbidden';
      }
      return 'admin.error';
    },
    [handleAuthError],
  );
}

export function useAdminMe() {
  const { state } = useAdminSession();
  return state.phase === 'authed' ? state.me : null;
}

interface FrameProps {
  title: MessageId;
  roles: readonly StaffRole[];
  children: ReactNode;
}

/** Shared admin chrome: who you are, role-filtered navigation, DEMO note, sign-out, and the per-page role gate. */
export function AdminFrame({ title, roles, children }: FrameProps) {
  const { t } = useI18n();
  const { signOut } = useAdminSession();
  const me = useAdminMe();
  const role = me?.user.role;
  const allowed = role !== undefined && roles.includes(role);
  return (
    <div className="booking">
      <header className="staff-bar">
        {me && (
          <p className="staff-bar__who">
            <strong>{me.user.displayName}</strong> - {t(`staff.role.${me.user.role}`)}
          </p>
        )}
        <nav className="staff-bar__nav" aria-label={t('admin.nav.label')}>
          {NAV.filter((n) => role !== undefined && n.roles.includes(role)).map((n) => (
            <Link key={n.to} to={n.to} className="btn btn--secondary">
              {t(n.label)}
            </Link>
          ))}
          <button type="button" className="btn btn--secondary" onClick={() => void signOut()}>
            {t('staff.frame.signOut')}
          </button>
        </nav>
      </header>
      <h1>{t(title)}</h1>
      <p className="demo-banner-inline" data-testid="admin-demo-note">
        {t('admin.demo.note')}
      </p>
      {allowed ? (
        children
      ) : (
        <p role="alert" className="field-error" data-testid="admin-forbidden">
          {t('admin.guard.forbidden')}
        </p>
      )}
    </div>
  );
}
