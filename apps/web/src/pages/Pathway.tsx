import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import {
  MUNICIPALITIES,
  PATHWAY_CONCERNS,
  URGENT_ARTICLE_SLUG,
  type MatchConcernResult,
  type MatchedClinic,
  type Municipality,
  type PathwayConcern,
  type PathwayMatchRequest,
} from '@kalinga/shared';
import { usePathwayMatch } from '../api/pathway';
import { DemoLabel, VerificationNote, isPracticeKey, isServiceCategory } from '../components/clinic-facts';
import { useI18n } from '../i18n/I18nProvider';
import { formatNumber } from '../i18n/format';

type Step = 1 | 2 | 3;
type Phase = 'questions' | 'results' | 'urgent';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Human label for a machine attribute key returned by the match API. Unknown shapes degrade to a generic label. */
function useAttributeLabel() {
  const { t } = useI18n();
  return (attribute: string): string => {
    if (attribute === 'municipality') return t('pathway.attr.municipality');
    const [kind, rest = ''] = attribute.split(':');
    if (kind === 'fee' && isServiceCategory(rest)) return `${t('pathway.attr.fee')} ${t(`clinics.service.${rest}`)}`;
    if (isPracticeKey(attribute)) return t(`clinics.practice.${attribute}`);
    return t('pathway.attr.other');
  };
}

function ConcernList({ items, showFlags }: { items: MatchConcernResult[]; showFlags: boolean }) {
  const { t } = useI18n();
  const attributeLabel = useAttributeLabel();
  return (
    <ul className="fact-list">
      {items.map((c) => (
        <li key={c.concern} data-state={c.state}>
          <strong>{t(`pathway.concern.${c.concern}`)}</strong>
          {c.attributes.length > 0 && (
            <ul className="attr-list">
              {c.attributes.map((a, i) => (
                <li key={`${a.attribute}-${i}`}>
                  {attributeLabel(a.attribute)}
                  {showFlags && (
                    <>
                      {' · '}
                      <span className="flag" data-flag={a.confirmed ? 'verified' : 'unknown'}>
                        {a.confirmed ? t('pathway.flag.verified') : t('pathway.flag.unknown')}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ match }: { match: MatchedClinic }) {
  const { t } = useI18n();
  return (
    <li className="match-card" data-demo={match.isDemo ? 'true' : undefined}>
      <h3>
        <span className="match-card__rank">
          <span className="sr-only">{t('pathway.match.rank')} </span>#{match.rank}
        </span>{' '}
        <Link to={`/clinics/${match.slug}`}>{match.name}</Link>
      </h3>
      <DemoLabel isDemo={match.isDemo} />
      <p className="clinic-card__place">
        {t('clinics.filter.municipality')}: {match.municipality}
      </p>
      <VerificationNote verification={match.verification} />

      <section aria-label={t('pathway.match.fit')}>
        <p className="clinic-card__label">{t('pathway.match.fit')}</p>
        {match.whyMayFit.length === 0 ? <p className="field-hint">{t('pathway.match.none')}</p> : <ConcernList items={match.whyMayFit} showFlags />}
      </section>
      <section aria-label={t('pathway.match.unknown')}>
        <p className="clinic-card__label">{t('pathway.match.unknown')}</p>
        {match.remainsUnknown.length === 0 ? (
          <p className="field-hint">{t('pathway.match.none')}</p>
        ) : (
          <>
            <p className="field-hint">{t('pathway.match.unknownHint')}</p>
            <ConcernList items={match.remainsUnknown} showFlags />
          </>
        )}
      </section>
      {match.notMet.length > 0 && (
        <section aria-label={t('pathway.match.notMet')}>
          <p className="clinic-card__label">{t('pathway.match.notMet')}</p>
          <ConcernList items={match.notMet} showFlags={false} />
        </section>
      )}
    </li>
  );
}

export function Pathway() {
  const { t, locale } = useI18n();
  const mutation = usePathwayMatch();
  const [phase, setPhase] = useState<Phase>('questions');
  const [step, setStep] = useState<Step>(1);
  // All answers live only in component memory: no storage, no URL, gone when the page unmounts.
  const [concerns, setConcerns] = useState<PathwayConcern[]>([]);
  const [municipality, setMunicipality] = useState<Municipality | undefined>();
  const [note, setNote] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lastView = useRef(`questions-1`);

  // Move focus to the current heading after the user changes step/phase (not on first load).
  useEffect(() => {
    const view = `${phase}-${step}`;
    if (view === lastView.current) return;
    lastView.current = view;
    headingRef.current?.focus();
  }, [phase, step]);

  const stepTitle = (s: Step): string =>
    s === 1 ? t('pathway.step.concerns.title') : s === 2 ? t('pathway.step.municipality.title') : t('pathway.step.review.title');
  const goStep = (s: Step) => {
    setStep(s);
    setNote(`${t('pathway.step.label')} ${s} ${t('pathway.step.of')} 3: ${stepTitle(s)}`);
  };

  const toggleConcern = (c: PathwayConcern) =>
    setConcerns((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const body = (): PathwayMatchRequest => ({
    ...(concerns.length > 0 ? { concerns } : {}),
    ...(municipality ? { municipality } : {}),
  });

  const showUrgent = () => {
    setPhase('urgent');
    setNote('');
    mutation.mutate({ urgentExposureWithin72h: true });
  };
  const showResults = () => {
    setPhase('results');
    setNote('');
    mutation.mutate(body());
  };
  const backToQuestions = (to: Step) => {
    mutation.reset();
    setPhase('questions');
    goStep(to);
  };
  const reset = () => {
    mutation.reset();
    setConcerns([]);
    setMunicipality(undefined);
    setPhase('questions');
    setStep(1);
    setNote(t('pathway.announce.reset'));
  };

  const data = mutation.data;
  const ranked = data?.mode === 'ranked' ? data : undefined;
  const urgent = data?.mode === 'urgent' ? data : undefined;

  let live = note;
  if (phase === 'urgent') live = urgent ? t('pathway.announce.urgent') : mutation.isPending ? t('pathway.urgent.loading') : '';
  if (phase === 'results') {
    if (mutation.isPending) live = t('pathway.results.loading');
    else if (ranked) live = `${formatNumber(locale, ranked.matches.length)} ${t('pathway.results.count')}`;
    else if (mutation.isError) live = t('pathway.results.error');
  }

  const resetButton = (
    <button type="button" className="btn btn--text" onClick={reset}>
      {t('pathway.btn.reset')}
    </button>
  );

  return (
    <div className="pathway">
      <h1>{t('pathway.title')}</h1>
      <p className="learn__intro">{t('pathway.intro')}</p>
      {/* Polite live region. Deliberately not role=status; it is empty until the user does something. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="pathway-live">
        {live}
      </div>

      {phase !== 'urgent' && (
        <section className="urgent-banner" aria-labelledby="pw-urgent-title">
          <TriangleAlert className="urgent-banner__icon" size={28} aria-hidden="true" />
          <div className="urgent-banner__copy">
            <h2 id="pw-urgent-title">{t('pathway.urgent.title')}</h2>
            <p>{t('pathway.urgent.body')}</p>
            <button type="button" className="btn btn--primary" onClick={showUrgent}>
              {t('pathway.urgent.button')}
            </button>
          </div>
        </section>
      )}

      {phase === 'urgent' && (
        <section className="urgent-banner urgent-banner--result" aria-labelledby="pw-urgent-result" data-testid="pathway-urgent" aria-busy={mutation.isPending}>
          <TriangleAlert className="urgent-banner__icon" size={28} aria-hidden="true" />
          <div className="urgent-banner__copy">
            <h2 id="pw-urgent-result" ref={headingRef} tabIndex={-1}>
              {t('pathway.urgent.result.title')}
            </h2>
            {/* Shown immediately; replaced by the API's wording when it arrives. The static copy is the fallback if the API is unreachable. */}
            <p>{urgent ? urgent.guidance.message[locale] : t('pathway.urgent.fallback')}</p>
            <p className="field-hint">{t('pathway.urgent.noContacts')}</p>
            <p className="field-hint">{t('pathway.urgent.unreviewed')}</p>
            <div className="actions">
              <Link
                to={`/learn/${urgent && SLUG_RE.test(urgent.guidance.articleSlug) ? urgent.guidance.articleSlug : URGENT_ARTICLE_SLUG}`}
                className="btn btn--primary"
              >
                {t('pathway.urgent.read')}
              </Link>
              <button type="button" className="btn btn--secondary" onClick={() => backToQuestions(1)}>
                {t('pathway.urgent.back')}
              </button>
            </div>
          </div>
        </section>
      )}

      {phase === 'questions' && (
        <section className="pathway__step card" aria-labelledby="pw-step-title">
          <p className="pathway__progress">
            {t('pathway.step.label')} {step} {t('pathway.step.of')} 3
          </p>
          <h2 id="pw-step-title" ref={headingRef} tabIndex={-1}>
            {stepTitle(step)}
          </h2>

          {step === 1 && (
            <fieldset className="choice-group">
              <legend className="sr-only">{t('pathway.step.concerns.title')}</legend>
              <p className="field-hint">{t('pathway.step.concerns.hint')}</p>
              {PATHWAY_CONCERNS.map((c) => (
                <label key={c} className="choice">
                  <input type="checkbox" checked={concerns.includes(c)} onChange={() => toggleConcern(c)} />
                  <span>{t(`pathway.concern.${c}`)}</span>
                </label>
              ))}
              {concerns.length > 0 && (
                <div>
                  <p className="clinic-card__label">{t('pathway.review.concerns')}</p>
                  <ol className="order-list">
                    {concerns.map((c) => (
                      <li key={c}>{t(`pathway.concern.${c}`)}</li>
                    ))}
                  </ol>
                </div>
              )}
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="choice-group">
              <legend className="sr-only">{t('pathway.step.municipality.title')}</legend>
              <p className="field-hint">{t('pathway.step.municipality.hint')}</p>
              <label className="choice">
                <input type="radio" name="pw-municipality" checked={municipality === undefined} onChange={() => setMunicipality(undefined)} />
                <span>{t('pathway.municipality.none')}</span>
              </label>
              {MUNICIPALITIES.map((m) => (
                <label key={m} className="choice">
                  <input type="radio" name="pw-municipality" checked={municipality === m} onChange={() => setMunicipality(m)} />
                  <span>{m}</span>
                </label>
              ))}
            </fieldset>
          )}

          {step === 3 && (
            <div className="pathway__review">
              <dl className="fact-dl">
                <dt>{t('pathway.review.concerns')}</dt>
                <dd>
                  {concerns.length === 0 ? (
                    t('pathway.review.none')
                  ) : (
                    <ol className="order-list">
                      {concerns.map((c) => (
                        <li key={c}>{t(`pathway.concern.${c}`)}</li>
                      ))}
                    </ol>
                  )}
                  <button type="button" className="btn btn--text" onClick={() => goStep(1)}>
                    {t('pathway.review.editConcerns')}
                  </button>
                </dd>
                <dt>{t('pathway.review.municipality')}</dt>
                <dd>
                  {municipality ?? t('pathway.review.none')}
                  <button type="button" className="btn btn--text" onClick={() => goStep(2)}>
                    {t('pathway.review.editMunicipality')}
                  </button>
                </dd>
              </dl>
            </div>
          )}

          <div className="actions pathway__nav">
            {step > 1 && (
              <button type="button" className="btn btn--secondary" onClick={() => goStep((step - 1) as Step)}>
                {t('pathway.btn.back')}
              </button>
            )}
            {step < 3 && (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    if (step === 1) setConcerns([]);
                    else setMunicipality(undefined);
                    goStep((step + 1) as Step);
                  }}
                >
                  {t('pathway.btn.skip')}
                </button>
                <button type="button" className="btn btn--primary" onClick={() => goStep((step + 1) as Step)}>
                  {t('pathway.btn.next')}
                </button>
              </>
            )}
            {step === 3 && (
              <button type="button" className="btn btn--primary" onClick={showResults}>
                {t('pathway.btn.show')}
              </button>
            )}
            {resetButton}
          </div>
        </section>
      )}

      {phase === 'results' && (
        <section aria-labelledby="pw-results-title" aria-busy={mutation.isPending}>
          <h2 id="pw-results-title" ref={headingRef} tabIndex={-1}>
            {t('pathway.results.title')}
          </h2>
          <p className="field-hint">{t('pathway.results.disclaimer')}</p>
          {mutation.isPending && <p>{t('pathway.results.loading')}</p>}
          {mutation.isError && (
            <div className="state-box" role="alert">
              <p>{t('pathway.results.error')}</p>
              <div className="actions">
                <button type="button" className="btn btn--secondary" onClick={() => mutation.mutate(mutation.variables ?? body())}>
                  {t('pathway.results.retry')}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => backToQuestions(3)}>
                  {t('pathway.btn.edit')}
                </button>
              </div>
            </div>
          )}
          {ranked && (
            <>
              {ranked.appliedFilters.notEvaluated.length > 0 && (
                <p className="field-hint" data-testid="pathway-not-evaluated">
                  {t('pathway.results.notEvaluated')} {ranked.appliedFilters.notEvaluated.map((c) => t(`pathway.concern.${c}`)).join(', ')}.{' '}
                  {t('pathway.results.notEvaluatedHint')}
                </p>
              )}
              {ranked.matches.length === 0 ? (
                <div className="state-box" data-testid="pathway-empty">
                  <p>{t('pathway.results.empty')}</p>
                  <Link to="/clinics" className="btn btn--secondary">
                    {t('pathway.results.browse')}
                  </Link>
                </div>
              ) : (
                <ol className="match-list">
                  {ranked.matches.map((m) => (
                    <MatchCard key={m.clinicId} match={m} />
                  ))}
                </ol>
              )}
              <div className="actions">
                <button type="button" className="btn btn--secondary" onClick={() => backToQuestions(3)}>
                  {t('pathway.btn.edit')}
                </button>
                {resetButton}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
