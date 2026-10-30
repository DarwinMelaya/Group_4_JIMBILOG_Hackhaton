import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminConfig } from '@kalinga/shared';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { ADMIN_ROLES, AdminFrame, ROLES_CLINICS, useAdminMe, useErrorText } from '../../admin/AdminFrame';
import { getAdminConfig, listAdminClinics } from '../../api/admin';

export function AdminDashboard() {
  const { t } = useI18n();
  const me = useAdminMe();
  const errorText = useErrorText();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [clinicCount, setClinicCount] = useState<number | null>(null);
  const [error, setError] = useState<MessageId | null>(null);
  const csrf = me?.csrfToken;
  const role = me?.user.role;

  const load = useCallback(async () => {
    if (!csrf || !role) return;
    // Each call is role-gated by the API: config is technical_admin only, the clinic list provincial/technical only.
    const jobs: Array<Promise<void>> = [];
    if (role === 'technical_admin') jobs.push(getAdminConfig(undefined, csrf).then(setConfig));
    if (ROLES_CLINICS.includes(role)) jobs.push(listAdminClinics(undefined, csrf).then((c) => setClinicCount(c.length)));
    try {
      await Promise.all(jobs);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [csrf, role, errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const flag = (v: boolean) => (v ? t('admin.config.on') : t('admin.config.off'));

  return (
    <AdminFrame title="admin.dashboard.title" roles={ADMIN_ROLES}>
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}
      {config && (
        <section className="card" aria-labelledby="admin-config-h">
          <h2 id="admin-config-h">{t('admin.config.title')}</h2>
          <ul>
            <li>
              {t('admin.config.demoMode')}: {flag(config.demoMode)}
            </li>
            <li>
              {t('admin.config.notifications')}: {config.notificationTransport}
            </li>
            <li>
              {t('admin.config.realBooking')}: {flag(config.realBookingRequestsEnabled)}
            </li>
            <li>
              {t('admin.config.realMinor')}: {flag(config.realMinorBookingEnabled)}
            </li>
            <li>
              {t('admin.config.clinical')}: {flag(config.clinicalContentApproved)}
            </li>
          </ul>
        </section>
      )}
      {clinicCount !== null && (
        <section className="card" aria-labelledby="admin-clinics-h">
          <h2 id="admin-clinics-h">{t('admin.clinics.title')}</h2>
          <p>
            {t('admin.dashboard.clinicCount')}: {clinicCount}
          </p>
          <p>
            <Link to="/admin/clinics" className="btn">
              {t('admin.clinics.manage')}
            </Link>
          </p>
        </section>
      )}
      <p>
        <Link to="/admin/reports" className="btn btn--secondary">
          {t('reports.link')}
        </Link>
      </p>
    </AdminFrame>
  );
}
