import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { useStaffSession } from './StaffSession';

/**
 * Staff sign-in. Credentials go in the JSON body of a POST only (the form has method=post and a fragment action, so
 * even without JavaScript nothing reaches the address bar). The password is cleared after every attempt. One generic
 * failure message covers unknown account, wrong password, locked and deactivated accounts, so the screen reveals nothing.
 * autoComplete="off" asks browsers not to remember or offer saved credentials: staff may share a clinic computer.
 */
export function StaffLogin() {
  const { t } = useI18n();
  const { state, signIn } = useStaffSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (state.phase === 'authed') return <Navigate to="/staff/requests" replace />;

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
      <h1>{t('staff.login.title')}</h1>
      <p>{t('staff.login.intro')}</p>
      {reason && (
        <p className="booking__notice" data-testid="staff-login-notice">
          {t(`staff.login.notice.${reason}`)}
        </p>
      )}
      <form onSubmit={(e) => void onSubmit(e)} noValidate method="post" action="#" className="booking__form" aria-labelledby="staff-login-form-title">
        <h2 id="staff-login-form-title" className="sr-only">
          {t('staff.login.title')}
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="staff-email">
            {t('staff.login.email')}
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={submitted && emailMissing ? true : undefined}
            aria-describedby={submitted && emailMissing ? 'staff-email-err' : undefined}
          />
          {submitted && emailMissing && (
            <p id="staff-email-err" className="field-error">
              {t('staff.login.err.email')}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="staff-password">
            {t('staff.login.password')}
          </label>
          <input
            id="staff-password"
            name="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={submitted && passwordMissing ? true : undefined}
            aria-describedby={submitted && passwordMissing ? 'staff-password-err' : undefined}
          />
          {submitted && passwordMissing && (
            <p id="staff-password-err" className="field-error">
              {t('staff.login.err.password')}
            </p>
          )}
        </div>
        {errorText && (
          <p role="alert" className="field-error" data-testid="staff-login-error">
            {errorText}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>
            {t(pending ? 'staff.login.submitting' : 'staff.login.submit')}
          </button>
        </div>
        <p className="field-hint">{t('staff.login.noRemember')}</p>
      </form>
    </div>
  );
}
