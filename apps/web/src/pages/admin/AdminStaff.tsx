import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CLINIC_LEVEL_ROLES,
  GRANTABLE_ROLES,
  STAFF_ROLES,
  type AdminClinic,
  type InviteCreate,
  type InviteCreated,
  type InviteSummary,
  type StaffAdminUser,
  type StaffRole,
} from '@kalinga/shared';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { AdminFrame, ROLES_CLINICS, ROLES_STAFF, useAdminMe, useErrorText } from '../../admin/AdminFrame';
import { assignMembership, createInvite, deactivateUser, listAdminClinics, listInvites, listStaffAdmin, removeMembership, revokeInvite } from '../../api/admin';

const isClinicRole = (r: string) => r === 'clinic_staff' || r === 'clinic_admin';

function StaffBody() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const me = useAdminMe();
  const csrf = me?.csrfToken;
  const myRole = me?.user.role;
  const myId = me?.user.id;

  const [staff, setStaff] = useState<StaffAdminUser[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [clinics, setClinics] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<MessageId | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('clinic_staff');
  const [clinicId, setClinicId] = useState('');
  // The one-time invite code lives ONLY in this component's state: never storage, never the URL, cleared on dismiss/unmount.
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [asgUser, setAsgUser] = useState('');
  const [asgClinic, setAsgClinic] = useState('');
  const [asgRole, setAsgRole] = useState<(typeof CLINIC_LEVEL_ROLES)[number]>('clinic_staff');

  const grantable = myRole ? STAFF_ROLES.filter((r) => GRANTABLE_ROLES[myRole].includes(r)) : [];
  const canDeactivate = myRole !== undefined && ROLES_CLINICS.includes(myRole);

  const load = useCallback(async () => {
    if (!csrf || !myRole) return;
    try {
      const [s, i] = await Promise.all([listStaffAdmin(undefined, csrf), listInvites(undefined, csrf)]);
      setStaff(s);
      setInvites(i);
      if (ROLES_CLINICS.includes(myRole)) {
        const cl: AdminClinic[] = await listAdminClinics(undefined, csrf);
        setClinics(cl.map((c) => ({ id: c.id, name: c.name })));
      } else {
        // clinic_admin cannot list all clinics: it may only act on clinics it administers.
        setClinics((me?.memberships ?? []).filter((m) => m.role === 'clinic_admin').map((m) => ({ id: m.clinicId, name: m.clinicName })));
      }
    } catch (err) {
      setError(errorText(err));
    }
  }, [csrf, myRole, me?.memberships, errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (job: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await job();
      await load();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  };

  const onInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!csrf) return;
    const body: InviteCreate = isClinicRole(role) ? { email: email.trim(), role, clinicId } : { email: email.trim(), role };
    if (!body.email || (isClinicRole(role) && !clinicId)) {
      setError('admin.err.validation_failed');
      return;
    }
    setError(null);
    try {
      setCreated(await createInvite(body, csrf));
      setEmail('');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const onAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!csrf || !asgUser || !asgClinic) {
      setError('admin.err.validation_failed');
      return;
    }
    void run(() => assignMembership(asgUser, { clinicId: asgClinic, role: asgRole }, csrf));
  };

  const roleOptions = grantable.map((r) => (
    <option key={r} value={r}>
      {t(`staff.role.${r}`)}
    </option>
  ));

  return (
    <>
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}

      {created && (
        <section className="card" aria-labelledby="invite-code-h" data-testid="invite-code-card">
          <h2 id="invite-code-h">{t('admin.staff.codeTitle')}</h2>
          <p>
            {created.email} ({t(`staff.role.${created.role}`)})
          </p>
          <p>
            <code data-testid="invite-code">{created.inviteCode}</code>
          </p>
          <p className="field-hint">{t('admin.staff.codeNote')}</p>
          <button type="button" className="btn" onClick={() => setCreated(null)}>
            {t('admin.staff.codeDismiss')}
          </button>
        </section>
      )}

      <form onSubmit={(e) => void onInvite(e)} noValidate className="card booking__form" aria-labelledby="invite-h">
        <h2 id="invite-h">{t('admin.staff.invite')}</h2>
        <div className="field">
          <label className="field-label" htmlFor="invite-email">
            {t('admin.staff.email')}
          </label>
          <input id="invite-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" spellCheck={false} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="invite-role">
            {t('admin.staff.role')}
          </label>
          <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            {roleOptions}
          </select>
        </div>
        {isClinicRole(role) && (
          <div className="field">
            <label className="field-label" htmlFor="invite-clinic">
              {t('admin.staff.clinic')}
            </label>
            <select id="invite-clinic" className="input" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
              <option value="" />
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn">
          {t('admin.staff.sendInvite')}
        </button>
      </form>

      <section className="card" aria-labelledby="staff-list-h">
        <h2 id="staff-list-h">{t('admin.staff.list')}</h2>
        {staff.length === 0 ? (
          <p>{t('admin.empty')}</p>
        ) : (
          <ul className="staff-list">
            {staff.map((s) => (
              <li key={s.id}>
                {s.displayName} ({s.email}) - {t(`staff.role.${s.role}`)} - {s.active ? t('admin.staff.active') : t('admin.staff.inactive')}
                {s.memberships
                  .filter((m) => m.active)
                  .map((m) => (
                    <span key={m.clinicId}>
                      {' '}
                      [{m.clinicSlug}: {t(`staff.role.${m.role}`)}{' '}
                      <button type="button" className="btn btn--secondary" onClick={() => csrf && void run(() => removeMembership(s.id, m.clinicId, csrf))}>
                        {t('admin.staff.remove')} {m.clinicSlug}
                      </button>
                      ]
                    </span>
                  ))}
                {canDeactivate && s.active && s.id !== myId && (
                  <button type="button" className="btn btn--secondary" onClick={() => csrf && void run(() => deactivateUser(s.id, csrf))}>
                    {t('admin.staff.deactivate')} {s.email}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {staff.some((s) => isClinicRole(s.role)) && (
        <form onSubmit={onAssign} noValidate className="card booking__form" aria-labelledby="assign-h">
          <h2 id="assign-h">{t('admin.staff.assign')}</h2>
          <div className="field">
            <label className="field-label" htmlFor="asg-user">
              {t('admin.staff.user')}
            </label>
            <select id="asg-user" className="input" value={asgUser} onChange={(e) => setAsgUser(e.target.value)}>
              <option value="" />
              {staff
                .filter((s) => isClinicRole(s.role) && s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.email}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="asg-clinic">
              {t('admin.staff.clinic')}
            </label>
            <select id="asg-clinic" className="input" value={asgClinic} onChange={(e) => setAsgClinic(e.target.value)}>
              <option value="" />
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="asg-role">
              {t('admin.staff.role')}
            </label>
            <select id="asg-role" className="input" value={asgRole} onChange={(e) => setAsgRole(e.target.value as typeof asgRole)}>
              {CLINIC_LEVEL_ROLES.filter((r) => GRANTABLE_ROLES[myRole ?? 'clinic_staff'].includes(r)).map((r) => (
                <option key={r} value={r}>
                  {t(`staff.role.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            {t('admin.staff.assign')}
          </button>
        </form>
      )}

      <section className="card" aria-labelledby="invites-h">
        <h2 id="invites-h">{t('admin.staff.invites')}</h2>
        {invites.length === 0 ? (
          <p>{t('admin.empty')}</p>
        ) : (
          <ul className="staff-list">
            {invites.map((i) => (
              <li key={i.id}>
                {i.email} ({t(`staff.role.${i.role}`)}) - {t(`admin.enum.${i.state}`)}
                {i.state === 'pending' && (
                  <button type="button" className="btn btn--secondary" onClick={() => csrf && void run(() => revokeInvite(i.id, csrf))}>
                    {t('admin.staff.revoke')} {i.email}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function AdminStaff() {
  return (
    <AdminFrame title="admin.staff.title" roles={ROLES_STAFF}>
      <StaffBody />
    </AdminFrame>
  );
}
