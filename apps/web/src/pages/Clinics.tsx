import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import {
  CLINIC_SERVICE_CATEGORIES,
  MUNICIPALITIES,
  PRIVACY_PRACTICE_KEYS,
  type ClinicServiceCategory,
  type ClinicSummary,
  type Municipality,
  type PrivacyPracticeKey,
} from '@kalinga/shared';
import { useClinics, type ClinicFilters } from '../api/clinics';
import { DemoLabel, VerificationNote, feeKey, serviceState } from '../components/clinic-facts';
import { UrgentPepBanner } from '../components/UrgentPepBanner';
import { useI18n } from '../i18n/I18nProvider';
import { formatNumber } from '../i18n/format';

const SEARCH_DEBOUNCE_MS = 250;
const FEE_TIER_FILTERS = ['free', 'low', 'standard'] as const;
type FeeTierFilter = (typeof FEE_TIER_FILTERS)[number];

function pick<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function ClinicCard({ clinic }: { clinic: ClinicSummary }) {
  const { t } = useI18n();
  return (
    <li className="clinic-card" data-demo={clinic.isDemo ? 'true' : undefined}>
      <h3>
        <Link to={`/clinics/${clinic.slug}`}>{clinic.name}</Link>
      </h3>
      <DemoLabel isDemo={clinic.isDemo} />
      <p className="clinic-card__place">
        {t('clinics.filter.municipality')}: {clinic.municipality}
      </p>
      <VerificationNote verification={clinic.verification} />
      <div>
        <p className="clinic-card__label">{t('clinics.card.services')}</p>
        {clinic.services.length === 0 ? (
          <p className="field-hint">{t('clinics.card.noServices')}</p>
        ) : (
          <ul className="fact-list">
            {clinic.services.map((s) => {
              const state = serviceState(s);
              return (
                <li key={s.category} data-state={state}>
                  {t(`clinics.service.${s.category}`)}: <strong>{t(`clinics.service.${state}`)}</strong>
                  {state === 'available' && <> · {t(feeKey(s.fee))}</>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export function Clinics() {
  const { t, locale } = useI18n();
  const searchId = useId();
  const hintId = useId();
  const muniId = useId();
  const serviceId = useId();
  const feeId = useId();
  const feeHintId = useId();
  const privacyId = useId();
  const privacyHintId = useId();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [municipality, setMunicipality] = useState<Municipality | undefined>();
  const [service, setService] = useState<ClinicServiceCategory | undefined>();
  const [feeTier, setFeeTier] = useState<FeeTierFilter | undefined>();
  const [privacy, setPrivacy] = useState<PrivacyPracticeKey | undefined>();

  useEffect(() => {
    const id = window.setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [input]);

  const filters: ClinicFilters = { municipality, service, feeTier, privacy, q: q || undefined };
  const { data, isPending, isError, refetch } = useClinics(filters);
  const filtered = q !== '' || municipality !== undefined || service !== undefined || feeTier !== undefined || privacy !== undefined;

  const clear = () => {
    setInput('');
    setQ('');
    setMunicipality(undefined);
    setService(undefined);
    setFeeTier(undefined);
    setPrivacy(undefined);
  };

  return (
    <div className="clinics">
      <h1>{t('clinics.title')}</h1>
      <p className="learn__intro">{t('clinics.intro')}</p>

      <UrgentPepBanner />

      <section className="card clinics__pathway" aria-labelledby="clinics-pathway-title">
        <h2 id="clinics-pathway-title">{t('clinics.pathway.title')}</h2>
        <p>{t('clinics.pathway.body')}</p>
        <Link to="/pathway" className="btn btn--secondary">
          <ShieldCheck size={18} aria-hidden="true" /> {t('clinics.pathway.cta')}
        </Link>
      </section>

      <section aria-labelledby="clinics-filters-title" className="filters">
        <h2 id="clinics-filters-title">{t('clinics.filters.title')}</h2>
        <div className="filters__grid">
          <div>
            <label htmlFor={searchId} className="field-label">{t('clinics.search.label')}</label>
            <input
              id={searchId}
              type="search"
              className="input"
              value={input}
              maxLength={80}
              autoComplete="off"
              aria-describedby={hintId}
              onChange={(e) => setInput(e.target.value)}
            />
            <p id={hintId} className="field-hint">{t('clinics.search.hint')}</p>
          </div>
          <div>
            <label htmlFor={muniId} className="field-label">{t('clinics.filter.municipality')}</label>
            <select id={muniId} className="input" value={municipality ?? ''} onChange={(e) => setMunicipality(pick(e.target.value, MUNICIPALITIES))}>
              <option value="">{t('clinics.filter.any')}</option>
              {MUNICIPALITIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={serviceId} className="field-label">{t('clinics.filter.service')}</label>
            <select id={serviceId} className="input" value={service ?? ''} onChange={(e) => setService(pick(e.target.value, CLINIC_SERVICE_CATEGORIES))}>
              <option value="">{t('clinics.filter.any')}</option>
              {CLINIC_SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`clinics.service.${c}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={feeId} className="field-label">{t('clinics.filter.fee')}</label>
            <select id={feeId} className="input" value={feeTier ?? ''} aria-describedby={feeHintId} onChange={(e) => setFeeTier(pick(e.target.value, FEE_TIER_FILTERS))}>
              <option value="">{t('clinics.filter.any')}</option>
              {FEE_TIER_FILTERS.map((f) => (
                <option key={f} value={f}>{t(`clinics.fee.${f}`)}</option>
              ))}
            </select>
            <p id={feeHintId} className="field-hint">{t('clinics.filter.fee.hint')}</p>
          </div>
          <div>
            <label htmlFor={privacyId} className="field-label">{t('clinics.filter.privacy')}</label>
            <select id={privacyId} className="input" value={privacy ?? ''} aria-describedby={privacyHintId} onChange={(e) => setPrivacy(pick(e.target.value, PRIVACY_PRACTICE_KEYS))}>
              <option value="">{t('clinics.filter.any')}</option>
              {PRIVACY_PRACTICE_KEYS.map((k) => (
                <option key={k} value={k}>{t(`clinics.practice.${k}`)}</option>
              ))}
            </select>
            <p id={privacyHintId} className="field-hint">{t('clinics.filter.privacy.hint')}</p>
          </div>
        </div>
        {filtered && (
          <button type="button" className="btn btn--secondary" onClick={clear}>
            {t('clinics.filter.clear')}
          </button>
        )}
      </section>

      <section aria-labelledby="clinics-results-title" aria-busy={isPending}>
        <h2 id="clinics-results-title">{t('clinics.results.title')}</h2>
        {/* Polite live region (announces loading and the count). Deliberately not role=status. */}
        <div aria-live="polite" className="learn__status">
          {isPending && <p>{t('clinics.state.loading')}</p>}
          {data && data.total > 0 && (
            <p>
              {formatNumber(locale, data.total)} {t('clinics.results.count')}
            </p>
          )}
        </div>
        {isError && (
          <div className="state-box" role="alert">
            <p>{t('clinics.state.error')}</p>
            <button type="button" className="btn btn--secondary" onClick={() => void refetch()}>
              {t('clinics.state.retry')}
            </button>
          </div>
        )}
        {data && data.items.length === 0 && (
          <div className="state-box" data-testid="clinics-empty">
            <p>{t('clinics.state.empty')}</p>
            <p className="field-hint">{t('clinics.state.emptyHint')}</p>
            {filtered && (
              <button type="button" className="btn btn--secondary" onClick={clear}>
                {t('clinics.filter.clear')}
              </button>
            )}
          </div>
        )}
        {data && data.items.length > 0 && (
          <ul className="clinic-list">
            {data.items.map((c) => (
              <ClinicCard key={c.id} clinic={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
