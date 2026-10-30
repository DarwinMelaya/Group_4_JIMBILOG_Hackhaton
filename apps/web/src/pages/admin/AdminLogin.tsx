import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiRequestError } from '../../api/client';
import { useI18n } from '../../i18n/I18nProvider';
import { useAdminSession } from '../../admin/AdminSession';

export function AdminLogin() {
  const { t } = useI18n();
  const { state, signIn } = useAdminSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (state.phase === 'authed') {
    const role = state.me.user.role;
    if (role === 'provincial_admin' || role === 'technical_admin' || role === 'clinic_admin') {
      return <Navigate to="/admin" replace />;
    }
  }

  const emailMissing = email.trim() === '';
  const passwordMissing = password === '';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (emailMissing || passwordMissing) return;
    setPending(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err);
      setPassword('');
      setPending(false);
    }
  };

  let errorText: string | null = null;
  if (error !== null) {
    if (error instanceof ApiRequestError && error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60));
      errorText = `${t('staff.login.throttled.before')} ${minutes} ${t('staff.login.throttled.after')}`;
    } else if (error instanceof ApiRequestError && error.status === 401) {
      errorText = t('staff.login.fail');
    } else if (error instanceof ApiRequestError && (error.kind === 'network' || error.kind === 'invalid-response')) {
      errorText = t('staff.login.network');
    } else {
      errorText = t('staff.login.generic');
    }
  }
  const reason = state.phase === 'anonymous' ? state.reason : undefined;

  return (
    <div className="booking staff-login">
      <h1>{t('admin.login.title')}</h1>
      <p>{t('admin.login.intro')}</p>
      {state.phase === 'authed' && (
        <p role="alert" className="field-error">
          {t('admin.guard.forbidden')}
        </p>
      )}
      {reason && (
        <p className="booking__notice" data-testid="admin-login-notice">
          {t(`staff.login.notice.${reason}`)}
        </p>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate method="post" action="#" className="booking__form" aria-labelledby="admin-login-form-title">
        <h2 id="admin-login-form-title" className="sr-only">
          {t('admin.login.title')}
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="admin-email">
            {t('staff.login.email')}
          </label>
          <input
            id="admin-email"
            name="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {submitted && emailMissing && <p className="field-error">{t('staff.login.err.email')}</p>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-password">
            {t('staff.login.password')}
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {submitted && passwordMissing && <p className="field-error">{t('staff.login.err.password')}</p>}
        </div>
        {errorText && (
          <p role="alert" className="field-error">
            {errorText}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn" disabled={pending}>
            {pending ? t('staff.login.submitting') : t('staff.login.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
