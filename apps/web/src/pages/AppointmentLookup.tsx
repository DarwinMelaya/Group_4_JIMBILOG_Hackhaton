import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import type { BookingLookupResponse } from '@kalinga/shared';
import { lookupBookingRequest } from '../api/bookings';
import { ApiRequestError } from '../api/client';
import { DemoLabel } from '../components/clinic-facts';
import { ReminderOptIn } from '../components/ReminderOptIn';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/format';

/**
 * Public status lookup. The reference and secret are posted in the JSON body only (the form has method=post and no
 * action URL, so even without JavaScript nothing would reach the address bar). They are held only in component state
 * and the secret is cleared as soon as a lookup succeeds or the user clears the screen.
 */
export function AppointmentLookup() {
  const { t, locale } = useI18n();
  // Direct call, not a TanStack mutation: the secret must not be kept as cached mutation variables.
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reference, setReference] = useState('');
  const [secret, setSecret] = useState('');
  const [reveal, setReveal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<BookingLookupResponse | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  // The proof for the reminder call lives in memory only (never state, storage or the DOM) and is dropped on Clear/unmount.
  const credsRef = useRef<{ reference: string; secret: string } | null>(null);
  useEffect(() => () => { credsRef.current = null; }, []);

  const refMissing = reference.trim() === '';
  const secretMissing = secret === '';

  const clear = () => {
    credsRef.current = null;
    setReference('');
    setSecret('');
    setReveal(false);
    setSubmitted(false);
    setResult(null);
    setError(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setResult(null);
    setError(null);
    credsRef.current = null;
    if (refMissing || secretMissing) return;
    setPending(true);
    try {
      const r = await lookupBookingRequest({ reference: reference.trim(), secret });
      credsRef.current = { reference: reference.trim(), secret };
      setResult(r);
      setSecret('');
      setReveal(false);
      setTimeout(() => resultRef.current?.focus(), 0);
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  };

  const err = error;
  let errorText: string | null = null;
  if (error !== null) {
    if (err instanceof ApiRequestError && err.status === 429) {
      const minutes = Math.max(1, Math.ceil((err.retryAfter ?? 60) / 60));
      errorText = `${t('lookup.throttled.before')} ${minutes} ${t('lookup.throttled.after')}`;
    } else if (err instanceof ApiRequestError && err.status === 404) {
      // One message for every kind of mismatch: unknown reference, wrong secret, expired.
      errorText = t('lookup.fail');
    } else if (err instanceof ApiRequestError && (err.kind === 'network' || err.kind === 'invalid-response')) {
      errorText = t('lookup.network');
    } else {
      errorText = t('lookup.generic');
    }
  }

  return (
    <div className="booking lookup">
      <h1>{t('lookup.title')}</h1>
      <p>{t('lookup.intro')}</p>

      <form onSubmit={(e) => void onSubmit(e)} noValidate method="post" action="#" className="booking__form" aria-labelledby="lookup-form-title">
        <h2 id="lookup-form-title" className="sr-only">
          {t('lookup.title')}
        </h2>
        <div className="field">
          <label className="field-label" htmlFor="lk-ref">
            {t('lookup.reference')}
          </label>
          <input
            id="lk-ref"
            name="reference"
            className="input input--mono"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={submitted && refMissing ? true : undefined}
            aria-describedby={submitted && refMissing ? 'lk-ref-err' : undefined}
          />
          {submitted && refMissing && (
            <p id="lk-ref-err" className="field-error">
              {t('lookup.err.reference')}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="lk-secret">
            {t('lookup.secret')}
          </label>
          <div className="copy-row">
            <input
              id="lk-secret"
              name="secret"
              className="input input--mono"
              type={reveal ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={submitted && secretMissing ? true : undefined}
              aria-describedby={submitted && secretMissing ? 'lk-secret-err' : undefined}
            />
            <button type="button" className="btn btn--secondary" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />} {t(reveal ? 'lookup.hide' : 'lookup.show')}
            </button>
          </div>
          {submitted && secretMissing && (
            <p id="lk-secret-err" className="field-error">
              {t('lookup.err.secret')}
            </p>
          )}
        </div>

        {errorText && (
          <p role="alert" className="field-error" data-testid="lookup-error">
            {errorText}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending}>
            {t(pending ? 'lookup.checking' : 'lookup.submit')}
          </button>
          <button type="button" className="btn btn--secondary" onClick={clear}>
            {t('lookup.clear')}
          </button>
        </div>
      </form>

      {result && (
        <section className="card" aria-labelledby="lk-result-title" data-testid="lookup-result" data-status={result.status}>
          <h2 id="lk-result-title" ref={resultRef} tabIndex={-1}>
            {t('lookup.result.heading')}
          </h2>
          <p className="booking__status">
            <strong>{t(`lookup.status.${result.status}.title`)}</strong>
          </p>
          <p>{t(`lookup.status.${result.status}.body`)}</p>
          <dl className="fact-dl fact-dl--stack">
            <dt>{t('lookup.result.clinic')}</dt>
            <dd>
              <Link to={`/clinics/${encodeURIComponent(result.clinic.slug)}`}>{result.clinic.name}</Link>
            </dd>
            {result.clinicNote && (
              <>
                <dt>{t('lookup.note')}</dt>
                <dd>{result.clinicNote}</dd>
              </>
            )}
            {result.visitInstructions && (
              <>
                <dt>{t('lookup.instructions')}</dt>
                <dd>{result.visitInstructions}</dd>
              </>
            )}
            <dt>{t('lookup.updated')}</dt>
            <dd>{formatDate(locale, result.updatedAt)}</dd>
          </dl>
          <DemoLabel isDemo={result.demo} />
          {result.demo && <p className="field-hint">{t('lookup.demo')}</p>}
        </section>
      )}

      {result && (result.status === 'pending' || result.status === 'confirmed' || result.status === 'alternative_offered') && (
        <ReminderOptIn getCredentials={() => credsRef.current} />
      )}

      <p className="field-hint">{t('lookup.lost')}</p>
    </div>
  );
}
