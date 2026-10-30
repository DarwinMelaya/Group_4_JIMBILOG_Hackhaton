import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  STAFF_BOOKING_TRANSITIONS,
  STAFF_INSTRUCTIONS_MAX,
  STAFF_NOTE_MAX,
  StaffBookingTransitionSchema,
  type BookingStatus,
  type StaffBookingDetail,
  type StaffBookingTransition,
} from '@kalinga/shared';
import { ApiRequestError } from '../api/client';
import { decideStaffRequest, getStaffRequest } from '../api/staff';
import { DemoLabel } from '../components/clinic-facts';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatDateTime } from '../i18n/format';
import { useStaffContext, useStaffLoad } from './StaffFrame';
import { useStaffSession } from './StaffSession';

type Decision = Extract<BookingStatus, 'confirmed' | 'alternative_offered' | 'cancelled'>;
const DECISIONS: readonly Decision[] = ['confirmed', 'alternative_offered', 'cancelled'];

/** Decisions the matrix allows from this status AND the server lists for this request. Terminal states allow none. */
export function allowedDecisions(detail: Pick<StaffBookingDetail, 'status' | 'allowedTransitions'>): Decision[] {
  const byMatrix = STAFF_BOOKING_TRANSITIONS[detail.status];
  return DECISIONS.filter((d) => byMatrix.includes(d) && detail.allowedTransitions.includes(d));
}

/** Today's date in Asia/Manila as YYYY-MM-DD (en-CA formats that way). Used only as a min hint for the date inputs. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

/**
 * Request detail and decision. Every string from the API (requester notes, clinic notes, instructions) is rendered as
 * plain text through React text nodes: nothing here interprets markup. The visit-time prefix the API puts at the start
 * of the clinic note is generated English text and is shown as-is.
 */
export function StaffRequestDetail() {
  const { t, locale } = useI18n();
  const { clinic } = useStaffContext();
  const { id = '' } = useParams();
  const clinicId = clinic.clinicId;
  const load = useCallback((signal: AbortSignal) => getStaffRequest(clinicId, id, signal), [clinicId, id]);
  const { state, reload, setData } = useStaffLoad(load);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (saved) savedRef.current?.focus();
  }, [saved]);

  const back = (
    <p>
      <Link to={`/staff/requests?clinic=${encodeURIComponent(clinicId)}`}>{t('staff.detail.back')}</Link>
    </p>
  );

  if (state.kind === 'loading') {
    return (
      <div className="booking">
        {back}
        <p role="status">{t('staff.detail.loading')}</p>
      </div>
    );
  }
  if (state.kind === 'notfound') {
    return (
      <div className="booking">
        {back}
        <p role="alert" className="field-error">
          {t('staff.detail.notFound')}
        </p>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="booking">
        {back}
        <p role="alert" className="field-error">
          {t('staff.detail.error')}
        </p>
        <p>
          <button type="button" className="btn btn--secondary" onClick={reload}>
            {t('staff.retry')}
          </button>
        </p>
      </div>
    );
  }

  const d = state.data;
  const notYet = t('staff.detail.none');
  return (
    <div className="booking staff-detail">
      {back}
      <h1>
        {t('staff.detail.title')} {d.reference}
      </h1>
      <p>
        <strong className="staff-status" data-testid="staff-detail-status" data-status={d.status}>
          {t(`staff.status.${d.status}`)}
        </strong>{' '}
        <DemoLabel isDemo={d.isDemo} />
      </p>
      {saved && (
        <p role="status" tabIndex={-1} ref={savedRef} className="booking__notice" data-testid="staff-saved">
          {t('staff.decide.saved')}
        </p>
      )}

      <section className="card" aria-labelledby="staff-detail-req">
        <h2 id="staff-detail-req">{t('staff.detail.requestHeading')}</h2>
        <dl className="fact-dl fact-dl--stack">
          <dt>{t('staff.item.preferred')}</dt>
          <dd>{formatDate(locale, d.preferredDate)}</dd>
          <dt>{t('staff.item.window')}</dt>
          <dd>{t(`booking.window.${d.preferredWindow}`)}</dd>
          <dt>{t('staff.item.service')}</dt>
          <dd>{d.service ? t(`clinics.service.${d.service}`) : t('staff.item.noService')}</dd>
          <dt>{t('staff.item.age')}</dt>
          <dd>{t(`booking.age.${d.ageBand}`)}</dd>
          <dt>{t('staff.detail.contact')}</dt>
          <dd>{d.contactPreference ? t(`booking.contact.${d.contactPreference}`) : notYet}</dd>
          <dt>{t('staff.detail.notes')}</dt>
          <dd className="staff-text" data-testid="staff-detail-notes">
            {d.notes ?? notYet}
          </dd>
          <dt>{t('staff.item.received')}</dt>
          <dd>{formatDateTime(locale, d.createdAt)}</dd>
        </dl>
        {d.isDemoMinorFlow && <p className="demo-banner-inline">{t('staff.detail.minorDemo')}</p>}
      </section>

      <section className="card" aria-labelledby="staff-detail-seen">
        <h2 id="staff-detail-seen">{t('staff.detail.seenHeading')}</h2>
        <dl className="fact-dl fact-dl--stack">
          <dt>{t('staff.detail.clinicNote')}</dt>
          <dd className="staff-text" data-testid="staff-detail-clinic-note">
            {d.clinicNote ?? notYet}
          </dd>
          <dt>{t('staff.detail.instructions')}</dt>
          <dd className="staff-text">{d.visitInstructions ?? notYet}</dd>
          <dt>{t('staff.detail.visitAt')}</dt>
          <dd>{d.visitStartsAt ? formatDateTime(locale, d.visitStartsAt) : notYet}</dd>
          <dt>{t('staff.detail.altAt')}</dt>
          <dd>{d.alternativeStartsAt ? formatDateTime(locale, d.alternativeStartsAt) : notYet}</dd>
          <dt>{t('staff.detail.decidedAt')}</dt>
          <dd>{d.decidedAt ? formatDateTime(locale, d.decidedAt) : notYet}</dd>
        </dl>
      </section>

      <DecisionForm
        // A new version means a fresh form: nothing typed for the old version is carried over.
        key={d.version}
        detail={d}
        clinicId={clinicId}
        onDecided={(next) => {
          setData(next);
          setSaved(true);
        }}
        onReload={() => {
          setSaved(false);
          reload();
        }}
      />
    </div>
  );
}

type FieldErrors = Partial<Record<'choice' | 'date' | 'time' | 'requirements' | 'note', string>>;
type SubmitError = 'conflict' | 'time' | 'invalid' | 'csrf' | 'network' | 'generic' | null;

function DecisionForm({
  detail,
  clinicId,
  onDecided,
  onReload,
}: {
  detail: StaffBookingDetail;
  clinicId: string;
  onDecided: (d: StaffBookingDetail) => void;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const session = useStaffSession();
  const csrf = session.state.phase === 'authed' ? session.state.me.csrfToken : '';
  const allowed = allowedDecisions(detail);

  const [choice, setChoice] = useState<Decision | ''>('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [requirements, setRequirements] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [pending, setPending] = useState(false);

  if (allowed.length === 0) {
    return (
      <section className="card" aria-labelledby="staff-decide-title">
        <h2 id="staff-decide-title">{t('staff.decide.title')}</h2>
        <p data-testid="staff-no-actions">{t('staff.decide.none')}</p>
      </section>
    );
  }

  const build = (): StaffBookingTransition | FieldErrors => {
    if (choice === '') return { choice: t('staff.decide.err.choose') };
    const instructions = requirements.trim();
    const shortNote = note.trim();
    const candidate =
      choice === 'confirmed'
        ? { status: choice, visitDate: date, visitTime: time, ...(instructions ? { visitInstructions: instructions } : {}) }
        : choice === 'alternative_offered'
          ? { status: choice, alternativeDate: date, alternativeTime: time, ...(shortNote ? { clinicNote: shortNote } : {}) }
          : { status: choice, ...(shortNote ? { clinicNote: shortNote } : {}) };
    const parsed = StaffBookingTransitionSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    const out: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key === 'visitDate' || key === 'alternativeDate') out.date = t('staff.decide.err.date');
      else if (key === 'visitTime' || key === 'alternativeTime') out.time = t('staff.decide.err.time');
      else if (key === 'visitInstructions') out.requirements = t('staff.decide.err.plain');
      else if (key === 'clinicNote') out.note = t('staff.decide.err.plain');
      else out.choice = t('staff.decide.err.choose');
    }
    return out;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const built = build();
    if (!('status' in built)) {
      setErrors(built);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      onDecided(await decideStaffRequest(clinicId, detail.id, detail.version, built, csrf));
    } catch (err) {
      setPending(false);
      if (session.handleAuthError(err)) return;
      if (err instanceof ApiRequestError && err.kind === 'http') {
        if (err.status === 409) setSubmitError('conflict'); // version_conflict or illegal_transition: the request moved on
        else if (err.status === 400 && err.code === 'visit_time_invalid') setSubmitError('time');
        else if (err.status === 400) setSubmitError('invalid');
        else if (err.status === 403) setSubmitError('csrf');
        else setSubmitError('generic');
      } else if (err instanceof ApiRequestError) setSubmitError('network');
      else setSubmitError('generic');
    }
  };

  const needsWhen = choice === 'confirmed' || choice === 'alternative_offered';
  const dateLabel = choice === 'alternative_offered' ? 'staff.decide.altDate' : 'staff.decide.date';
  const timeLabel = choice === 'alternative_offered' ? 'staff.decide.altTime' : 'staff.decide.time';

  return (
    <section className="card" aria-labelledby="staff-decide-title">
      <h2 id="staff-decide-title">{t('staff.decide.title')}</h2>
      <form onSubmit={(e) => void onSubmit(e)} noValidate method="post" action="#" className="booking__form">
        <fieldset className="choice-group" aria-describedby={errors.choice ? 'staff-choice-err' : undefined}>
          <legend className="field-label">{t('staff.decide.legend')}</legend>
          {DECISIONS.map((d) => {
            const ok = allowed.includes(d);
            return (
              <label key={d} className={ok ? 'choice' : 'choice choice--disabled'}>
                <input
                  type="radio"
                  name="decision"
                  value={d}
                  checked={choice === d}
                  disabled={!ok}
                  onChange={() => {
                    setChoice(d);
                    setErrors({});
                  }}
                />
                <span>
                  {t(`staff.decide.${d}`)}
                  {!ok && <> {t('staff.decide.notAllowed')}</>}
                </span>
              </label>
            );
          })}
          {errors.choice && (
            <p id="staff-choice-err" className="field-error">
              {errors.choice}
            </p>
          )}
        </fieldset>

        {needsWhen && (
          <>
            <p className="field-hint">{t('staff.decide.tz')}</p>
            <div className="field">
              <label className="field-label" htmlFor="staff-date">
                {t(dateLabel)}
              </label>
              <input
                id="staff-date"
                type="date"
                className="input"
                min={manilaToday()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={errors.date ? 'staff-date-err' : undefined}
              />
              {errors.date && (
                <p id="staff-date-err" className="field-error">
                  {errors.date}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="staff-time">
                {t(timeLabel)}
              </label>
              <input
                id="staff-time"
                type="time"
                className="input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={errors.time ? true : undefined}
                aria-describedby={errors.time ? 'staff-time-err' : undefined}
              />
              {errors.time && (
                <p id="staff-time-err" className="field-error">
                  {errors.time}
                </p>
              )}
            </div>
          </>
        )}

        {choice === 'confirmed' && (
          <div className="field">
            <label className="field-label" htmlFor="staff-requirements">
              {t('staff.decide.requirements')}
            </label>
            <textarea
              id="staff-requirements"
              className="input input--area"
              maxLength={STAFF_INSTRUCTIONS_MAX}
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              aria-describedby={errors.requirements ? 'staff-requirements-hint staff-requirements-err' : 'staff-requirements-hint'}
              aria-invalid={errors.requirements ? true : undefined}
            />
            <p id="staff-requirements-hint" className="field-hint">
              {t('staff.decide.requirements.hint')}
            </p>
            {errors.requirements && (
              <p id="staff-requirements-err" className="field-error">
                {errors.requirements}
              </p>
            )}
          </div>
        )}

        {(choice === 'alternative_offered' || choice === 'cancelled') && (
          <div className="field">
            <label className="field-label" htmlFor="staff-note">
              {t('staff.decide.note')}
            </label>
            <input
              id="staff-note"
              type="text"
              className="input"
              maxLength={STAFF_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              aria-describedby={errors.note ? 'staff-note-hint staff-note-err' : 'staff-note-hint'}
              aria-invalid={errors.note ? true : undefined}
            />
            <p id="staff-note-hint" className="field-hint">
              {t('staff.decide.note.hint')}
            </p>
            {errors.note && (
              <p id="staff-note-err" className="field-error">
                {errors.note}
              </p>
            )}
          </div>
        )}

        {(choice === 'confirmed' || choice === 'cancelled') && <p className="field-hint">{t('staff.decide.final')}</p>}

        {submitError && (
          <div role="alert" className="field-error" data-testid="staff-decide-error" data-kind={submitError}>
            <p>{t(`staff.decide.submitErr.${submitError}`)}</p>
            {(submitError === 'conflict' || submitError === 'csrf') && (
              <p>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => (submitError === 'csrf' ? void session.refresh() : onReload())}
                >
                  {t('staff.decide.reload')}
                </button>
              </p>
            )}
          </div>
        )}

        <div className="actions">
          <button type="submit" className="btn btn--primary" disabled={pending || submitError === 'conflict'} aria-busy={pending}>
            {t(pending ? 'staff.decide.saving' : 'staff.decide.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}
