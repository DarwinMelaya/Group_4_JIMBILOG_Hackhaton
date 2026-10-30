import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Eye, EyeOff } from 'lucide-react';
import {
  BOOKING_CONTACT_PREFERENCES,
  type AgeBandAvailability,
  type BookingAgeBand,
  type BookingConfig,
  type BookingContactPreference,
  type BookingCreateRequest,
  type BookingCreateResponse,
  type BookingWindow,
  type ClinicServiceCategory,
} from '@kalinga/shared';
import { createBookingRequest, newIdempotencyKey, useBookingConfig } from '../api/bookings';
import { ApiRequestError } from '../api/client';
import { DemoLabel, isServiceCategory } from '../components/clinic-facts';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageId } from '../i18n/catalog';

type FieldName = 'ageBand' | 'service' | 'preferredDate' | 'preferredWindow' | 'contactPreference' | 'notes' | 'ack';

interface Values {
  ageBand: BookingAgeBand | '';
  service: ClinicServiceCategory | '';
  preferredDate: string;
  preferredWindow: BookingWindow | '';
  contactPreference: BookingContactPreference | '';
  notes: string;
  ack: boolean;
}

const EMPTY: Values = { ageBand: '', service: '', preferredDate: '', preferredWindow: '', contactPreference: '', notes: '', ack: false };
const FIELD_IDS: Record<FieldName, string> = {
  ageBand: 'bk-age-0',
  service: 'bk-service',
  preferredDate: 'bk-date',
  preferredWindow: 'bk-window',
  contactPreference: 'bk-contact',
  notes: 'bk-notes',
  ack: 'bk-ack',
};

function availabilityOf(cfg: BookingConfig, band: BookingAgeBand): AgeBandAvailability {
  return cfg.ageBands.find((b) => b.value === band)?.availability ?? 'unavailable';
}

/** Client-side mirror of the clinic's rules, for inline feedback. The server re-validates everything. */
export function validateBooking(cfg: BookingConfig, v: Values): Partial<Record<FieldName, MessageId>> {
  const e: Partial<Record<FieldName, MessageId>> = {};
  if (v.ageBand === '') e.ageBand = 'booking.err.ageBand';
  else if (availabilityOf(cfg, v.ageBand) === 'unavailable') e.ageBand = 'booking.age.unavailable';
  if (cfg.fields.service.mode === 'required' && v.service === '') e.service = 'booking.err.service';
  if (v.preferredDate === '') e.preferredDate = 'booking.err.date';
  else if (v.preferredDate < cfg.dateRange.minDate || v.preferredDate > cfg.dateRange.maxDate) e.preferredDate = 'booking.err.dateRange';
  if (v.preferredWindow === '') e.preferredWindow = 'booking.err.window';
  if (cfg.fields.contactPreference.mode === 'required' && v.contactPreference === '') e.contactPreference = 'booking.err.contact';
  const notes = v.notes.trim();
  if (cfg.fields.notes.mode === 'required' && notes === '') e.notes = 'booking.err.notes';
  else if (notes.length > cfg.fields.notes.maxLength) e.notes = 'booking.err.notesLong';
  if (!v.ack) e.ack = 'booking.err.ack';
  return e;
}

function buildBody(cfg: BookingConfig, v: Values): BookingCreateRequest {
  const notes = v.notes.trim();
  return {
    clinicId: cfg.clinicId,
    ageBand: v.ageBand as BookingAgeBand,
    preferredDate: v.preferredDate,
    preferredWindow: v.preferredWindow as BookingWindow,
    ...(cfg.fields.service.mode !== 'hidden' && v.service !== '' ? { service: v.service } : {}),
    ...(cfg.fields.contactPreference.mode !== 'hidden' && v.contactPreference !== '' ? { contactPreference: v.contactPreference } : {}),
    ...(cfg.fields.notes.mode !== 'hidden' && notes !== '' ? { notes } : {}),
    acknowledgedDisclosure: true,
  };
}

function Req({ mode }: { mode: 'hidden' | 'optional' | 'required' }) {
  const { t } = useI18n();
  return <span className="field-hint"> ({t(mode === 'required' ? 'booking.form.required' : 'booking.form.optional')})</span>;
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  );
}

/** Copy button with a polite, text-only result (the live region is owned by the parent). */
function useCopy() {
  const [message, setMessage] = useState('');
  const { t } = useI18n();
  const copy = async (text: string, ok: MessageId) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t(ok));
    } catch {
      setMessage(t('booking.done.copyFail'));
    }
  };
  return { message, copy };
}

/**
 * The reference + one-time secret. They live only in this component's memory: never in the URL, localStorage,
 * sessionStorage or the query cache. The secret is masked by default and can be cleared with one button.
 */
function Receipt({ result, onClear }: { result: BookingCreateResponse; onClear: () => void }) {
  const { t } = useI18n();
  const [reveal, setReveal] = useState(false);
  const { message, copy } = useCopy();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const replay = 'alreadyCreated' in result;
  return (
    <section className="booking-done" aria-labelledby="bk-done-title">
      <h1 id="bk-done-title" ref={headingRef} tabIndex={-1}>
        {t(replay ? 'booking.replay.title' : 'booking.done.title')}
      </h1>
      <p className="demo-banner-inline">{t('booking.done.demo')}</p>
      {'demoMinorFlow' in result && result.demoMinorFlow && <p className="demo-banner-inline">{t('booking.done.minorDemo')}</p>}
      <p>
        <strong>{t('booking.done.notConfirmed')}</strong>
      </p>
      {replay && <p>{t('booking.replay.body')}</p>}

      <div className="card">
        <label className="field-label" htmlFor="bk-ref">
          {t('booking.done.reference')}
        </label>
        <div className="copy-row">
          <input id="bk-ref" className="input input--mono" readOnly value={result.reference} autoComplete="off" spellCheck={false} />
          <button type="button" className="btn btn--secondary" onClick={() => void copy(result.reference, 'booking.done.copiedRef')}>
            <Copy size={18} aria-hidden="true" /> {t('booking.done.copyRef')}
          </button>
        </div>
      </div>

      {'secret' in result && (
        <div className="card" data-testid="booking-secret-card">
          <h2>{t('booking.done.saveTitle')}</h2>
          <p>{t('booking.done.saveBody')}</p>
          <label className="field-label" htmlFor="bk-secret">
            {t('booking.done.secret')}
          </label>
          <div className="copy-row">
            <input
              id="bk-secret"
              className="input input--mono"
              readOnly
              type={reveal ? 'text' : 'password'}
              value={result.secret}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className="btn btn--secondary" aria-pressed={reveal} onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}{' '}
              {t(reveal ? 'booking.done.hide' : 'booking.done.show')}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => void copy(result.secret, 'booking.done.copiedSecret')}>
              <Copy size={18} aria-hidden="true" /> {t('booking.done.copySecret')}
            </button>
          </div>
        </div>
      )}

      <p className="field-hint" aria-live="polite" data-testid="copy-live">
        {message}
      </p>

      <div className="actions">
        <Link to="/appointments/lookup" className="btn btn--primary">
          {t('booking.done.check')}
        </Link>
        <button type="button" className="btn btn--secondary" onClick={onClear}>
          {t('booking.done.clear')}
        </button>
      </div>
    </section>
  );
}

function sendErrorMessage(err: unknown): MessageId {
  if (err instanceof ApiRequestError) {
    if (err.kind === 'network' || err.kind === 'invalid-response') return 'booking.send.network';
    if (err.code === 'under_15_not_supported' || err.code === 'minor_policy_not_configured') return 'booking.send.ageUnavailable';
    if (err.status === 429) return 'booking.send.rate';
    if (err.status === 400 || err.status === 404 || err.status === 409) return 'booking.send.invalid';
  }
  return 'booking.send.generic';
}

function RequestForm({ cfg }: { cfg: BookingConfig }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Direct call, not a TanStack mutation: the one-time secret must never sit in a shared cache.
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<BookingCreateResponse | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // One idempotency key per distinct body: retrying the same request re-sends the same key (no duplicate), and
  // editing the form starts a new key.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const errors = validateBooking(cfg, values);
  const shown = (f: FieldName): MessageId | undefined => (submitted || touched[f] ? errors[f] : undefined);
  const errorText = (f: FieldName): string | undefined => {
    const m = shown(f);
    return m ? t(m) : undefined;
  };
  const touch = (f: FieldName) => setTouched((p) => ({ ...p, [f]: true }));
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((p) => ({ ...p, [k]: v }));

  const errorFields = (Object.keys(errors) as FieldName[]).filter((f) => errors[f]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errorFields.length > 0) {
      // Defer so the summary exists before it takes focus.
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    const body = buildBody(cfg, values);
    const fingerprint = JSON.stringify(body);
    if (keyRef.current?.fingerprint !== fingerprint) keyRef.current = { fingerprint, key: newIdempotencyKey() };
    setSending(true);
    setSendError(null);
    try {
      setResult(await createBookingRequest(body, keyRef.current.key));
    } catch (err) {
      setSendError(err);
    } finally {
      setSending(false);
    }
  };

  const clearAndLeave = () => {
    setResult(null);
    setValues(EMPTY);
    keyRef.current = null;
    setSendError(null);
    navigate(`/clinics/${encodeURIComponent(cfg.slug)}`);
  };

  if (result) return <Receipt result={result} onClear={clearAndLeave} />;

  const d = cfg.disclosure;
  const age = values.ageBand === '' ? null : availabilityOf(cfg, values.ageBand);
  const serviceOptions = cfg.fields.service.options.filter(isServiceCategory);

  return (
    <div className="booking">
      <Link to={`/clinics/${encodeURIComponent(cfg.slug)}`} className="back-link">
        <ArrowLeft size={18} aria-hidden="true" /> {t('booking.back')}
      </Link>
      <h1>{t('booking.title')}</h1>
      <p className="booking__clinic">
        <strong>{cfg.clinicName}</strong>
      </p>
      <DemoLabel isDemo={cfg.isDemo} />
      {cfg.isDemo && <p className="demo-banner-inline">{t('booking.demoBanner')}</p>}
      <p className="booking__notice" data-testid="request-notice">
        <strong>{t('booking.requestNotice')}</strong>
      </p>

      <section className="card" aria-labelledby="bk-disclosure">
        <h2 id="bk-disclosure">{t('booking.disclosure.heading')}</h2>
        <h3>{t('booking.disclosure.fields')}</h3>
        <ul className="fact-list" data-testid="disclosure-fields">
          {d.dataFields.map((f) => (
            <li key={f}>{t(`booking.field.${f}`)}</li>
          ))}
        </ul>
        <p>{t('booking.disclosure.noPersonal')}</p>
        <dl className="fact-dl fact-dl--stack">
          <dt>{t('booking.disclosure.purpose')}</dt>
          <dd>{d.purpose}</dd>
          <dt>{t('booking.disclosure.recipient')}</dt>
          <dd>{d.recipient}</dd>
          <dt>{t('booking.disclosure.cancellation')}</dt>
          <dd>{d.cancellation}</dd>
          <dt>{t('booking.disclosure.lowDisclosure')}</dt>
          <dd>{t(cfg.lowDisclosureSupported ? 'booking.disclosure.lowYes' : 'booking.disclosure.lowNo')}</dd>
          <dt>{t('booking.disclosure.retention')}</dt>
          <dd>
            {d.retentionDays} {t('booking.disclosure.retentionDays')}
          </dd>
        </dl>
      </section>

      <form onSubmit={(e) => void onSubmit(e)} noValidate method="post" action="#" aria-labelledby="bk-form-title" className="booking__form">
        <h2 id="bk-form-title">{t('booking.form.heading')}</h2>

        {submitted && errorFields.length > 0 && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="state-box" data-testid="error-summary">
            <p>
              <strong>{t('booking.errors.summary')}</strong>
            </p>
            <ul className="fact-list">
              {errorFields.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    className="btn btn--text"
                    onClick={() => document.getElementById(FIELD_IDS[f])?.focus()}
                  >
                    {t(errors[f] as MessageId)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <fieldset className="choice-group" aria-describedby="bk-age-hint">
          <legend className="field-label">{t('booking.field.ageBand')}</legend>
          <p id="bk-age-hint" className="field-hint">
            {t('booking.age.hint')}
          </p>
          {cfg.ageBands.map((b, i) => (
            <label key={b.value} className="choice">
              <input
                id={`bk-age-${i}`}
                type="radio"
                name="ageBand"
                value={b.value}
                checked={values.ageBand === b.value}
                onChange={() => {
                  set('ageBand', b.value);
                  touch('ageBand');
                }}
                aria-describedby={shown('ageBand') ? 'bk-age-err' : undefined}
              />
              <span>
                {t(`booking.age.${b.value}`)}
                {b.availability === 'demo_only' && <> {t('booking.age.demoOnly')}</>}
              </span>
            </label>
          ))}
          {age === 'demo_only' && <p className="demo-banner-inline">{t('booking.age.demoNote')}</p>}
          <FieldError id="bk-age-err" message={errorText('ageBand')} />
        </fieldset>

        {cfg.fields.service.mode !== 'hidden' && (
          <div className="field">
            <label className="field-label" htmlFor="bk-service">
              {t('booking.field.service')}
              <Req mode={cfg.fields.service.mode} />
            </label>
            <select
              id="bk-service"
              className="input"
              value={values.service}
              onChange={(e) => set('service', e.target.value as Values['service'])}
              onBlur={() => touch('service')}
              aria-invalid={shown('service') ? true : undefined}
              aria-describedby={shown('service') ? 'bk-service-err' : undefined}
            >
              <option value="">{t(cfg.fields.service.mode === 'required' ? 'booking.service.choose' : 'booking.service.none')}</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>
                  {t(`clinics.service.${s}`)}
                </option>
              ))}
            </select>
            <FieldError id="bk-service-err" message={errorText('service')} />
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="bk-date">
            {t('booking.field.preferredDate')}
            <Req mode="required" />
          </label>
          <input
            id="bk-date"
            type="date"
            className="input"
            value={values.preferredDate}
            min={cfg.dateRange.minDate}
            max={cfg.dateRange.maxDate}
            onChange={(e) => set('preferredDate', e.target.value)}
            onBlur={() => touch('preferredDate')}
            aria-invalid={shown('preferredDate') ? true : undefined}
            aria-describedby={shown('preferredDate') ? 'bk-date-hint bk-date-err' : 'bk-date-hint'}
          />
          <p id="bk-date-hint" className="field-hint">
            {t('booking.date.hint')} {cfg.dateRange.minDate} – {cfg.dateRange.maxDate}
          </p>
          <FieldError id="bk-date-err" message={errorText('preferredDate')} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="bk-window">
            {t('booking.field.preferredWindow')}
            <Req mode="required" />
          </label>
          <select
            id="bk-window"
            className="input"
            value={values.preferredWindow}
            onChange={(e) => set('preferredWindow', e.target.value as Values['preferredWindow'])}
            onBlur={() => touch('preferredWindow')}
            aria-invalid={shown('preferredWindow') ? true : undefined}
            aria-describedby={shown('preferredWindow') ? 'bk-window-err' : undefined}
          >
            <option value="">{t('booking.window.choose')}</option>
            {cfg.preferredWindows.map((w) => (
              <option key={w} value={w}>
                {t(`booking.window.${w}`)}
              </option>
            ))}
          </select>
          <FieldError id="bk-window-err" message={errorText('preferredWindow')} />
        </div>

        {cfg.fields.contactPreference.mode !== 'hidden' && (
          <div className="field">
            <label className="field-label" htmlFor="bk-contact">
              {t('booking.field.contactPreference')}
              <Req mode={cfg.fields.contactPreference.mode} />
            </label>
            <select
              id="bk-contact"
              className="input"
              value={values.contactPreference}
              onChange={(e) => set('contactPreference', e.target.value as Values['contactPreference'])}
              onBlur={() => touch('contactPreference')}
              aria-invalid={shown('contactPreference') ? true : undefined}
              aria-describedby={shown('contactPreference') ? 'bk-contact-hint bk-contact-err' : 'bk-contact-hint'}
            >
              <option value="">{t('booking.contact.choose')}</option>
              {cfg.fields.contactPreference.options
                .filter((o): o is BookingContactPreference => (BOOKING_CONTACT_PREFERENCES as readonly string[]).includes(o))
                .map((o) => (
                  <option key={o} value={o}>
                    {t(`booking.contact.${o}`)}
                  </option>
                ))}
            </select>
            <p id="bk-contact-hint" className="field-hint">
              {t('booking.contact.hint')}
            </p>
            <FieldError id="bk-contact-err" message={errorText('contactPreference')} />
          </div>
        )}

        {cfg.fields.notes.mode !== 'hidden' && (
          <div className="field">
            <label className="field-label" htmlFor="bk-notes">
              {t('booking.field.notes')}
              <Req mode={cfg.fields.notes.mode} />
            </label>
            <textarea
              id="bk-notes"
              className="input input--area"
              rows={3}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
              onBlur={() => touch('notes')}
              autoComplete="off"
              aria-invalid={shown('notes') ? true : undefined}
              aria-describedby={shown('notes') ? 'bk-notes-hint bk-notes-err' : 'bk-notes-hint'}
            />
            <p id="bk-notes-hint" className="field-hint">
              {t('booking.notes.hint')} {cfg.fields.notes.maxLength}
            </p>
            <FieldError id="bk-notes-err" message={errorText('notes')} />
          </div>
        )}

        <div className="field">
          <label className="choice" htmlFor="bk-ack">
            <input
              id="bk-ack"
              type="checkbox"
              checked={values.ack}
              onChange={(e) => {
                set('ack', e.target.checked);
                touch('ack');
              }}
              aria-invalid={shown('ack') ? true : undefined}
              aria-describedby={shown('ack') ? 'bk-ack-err' : undefined}
            />
            <span>{t('booking.ack')}</span>
          </label>
          <FieldError id="bk-ack-err" message={errorText('ack')} />
        </div>

        {sendError !== null && (
          <p role="alert" className="field-error" data-testid="send-error">
            {t(sendErrorMessage(sendError))}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={sending} aria-busy={sending}>
            {t(sending ? 'booking.submitting' : 'booking.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BookingRequest() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { data, isPending, error, refetch } = useBookingConfig(id);

  const back = (
    <Link to={id ? `/clinics/${encodeURIComponent(id)}` : '/clinics'} className="back-link">
      <ArrowLeft size={18} aria-hidden="true" /> {t('booking.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className="booking">
        {back}
        <h1>{t('booking.title')}</h1>
        <p aria-live="polite">{t('booking.loading')}</p>
      </div>
    );
  }
  if (error || !data) {
    const http404 = error instanceof ApiRequestError && error.kind === 'http' && error.status === 404;
    if (http404 && error.code === 'not_found') {
      return (
        <div className="booking">
          {back}
          <h1>{t('clinics.profile.notFound.title')}</h1>
          <p role="alert">{t('clinics.profile.notFound.body')}</p>
        </div>
      );
    }
    if (http404) {
      return (
        <div className="booking">
          {back}
          <h1>{t('booking.unavailable.title')}</h1>
          <p>{t('booking.unavailable.body')}</p>
          <Link to="/clinics" className="btn btn--secondary">
            {t('nav.clinics')}
          </Link>
        </div>
      );
    }
    return (
      <div className="booking">
        {back}
        <h1>{t('booking.title')}</h1>
        <p role="alert">{t('booking.error')}</p>
        <button type="button" className="btn btn--secondary" onClick={() => void refetch()}>
          {t('booking.retry')}
        </button>
      </div>
    );
  }
  return <RequestForm cfg={data} />;
}
