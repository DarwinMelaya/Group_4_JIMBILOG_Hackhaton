import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import { useAdminSession } from './AdminSession';

export function AdminGuard() {
  const { t } = useI18n();
  const { state, refresh } = useAdminSession();
  useEffect(() => {
    if (state.phase === 'unknown') void refresh();
  }, [state.phase, refresh]);

  if (state.phase === 'anonymous') return <Navigate to="/admin/login" replace />;
  if (state.phase === 'authed') {
    const role = state.me.user.role;
    if (role !== 'provincial_admin' && role !== 'technical_admin' && role !== 'clinic_admin') {
      return (
        <div className="booking">
          <p role="alert" className="field-error">
            {t('admin.guard.forbidden')}
          </p>
        </div>
      );
    }
    return <Outlet />;
  }
  if (state.phase === 'error') {
    return (
      <div className="booking">
        <p role="alert" className="field-error">
          {t('admin.guard.error')}
        </p>
        <p>
          <button type="button" className="btn btn--secondary" onClick={() => void refresh()}>
            {t('staff.retry')}
          </button>
        </p>
      </div>
    );
  }
  return <p role="status">{t('admin.guard.checking')}</p>;
}
