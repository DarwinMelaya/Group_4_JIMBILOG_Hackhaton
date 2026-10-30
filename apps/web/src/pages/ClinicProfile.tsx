import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PRIVACY_PRACTICE_KEYS, type ClinicDetail } from '@kalinga/shared';
import { useClinic } from '../api/clinics';
import { useBookingConfig } from '../api/bookings';
import { ApiRequestError } from '../api/client';
import { BookingCta } from '../components/BookingCta';
import { DemoLabel, VerificationNote, feeKey, isPracticeKey, isServiceCategory, practiceState, serviceState } from '../components/clinic-facts';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/format';

/** Human text for a machine unknown key such as `service:hiv_testing`. Unrecognised keys degrade to a generic line. */
function useUnknownLabel() {
  const { t } = useI18n();
  return (key: string): string => {
    if (key === 'address') return t('clinics.unknown.address');
    if (key === 'contact') return t('clinics.unknown.contact');
    const [kind, rest = ''] = key.split(':');
    if (kind === 'service' && isServiceCategory(rest)) return `${t('clinics.unknown.service')} ${t(`clinics.service.${rest}`)}`;
    if (kind === 'fee' && isServiceCategory(rest)) return `${t('clinics.unknown.fee')} ${t(`clinics.service.${rest}`)}`;
    if (kind === 'practice' && isPracticeKey(rest)) return `${t('clinics.unknown.practice')} ${t(`clinics.practice.${rest}`)}`;
    return t('clinics.unknown.other');
  };
}

function Profile({ clinic }: { clinic: ClinicDetail }) {
  const { t, locale } = useI18n();
  const unknownLabel = useUnknownLabel();
  const unconfirmed = t('clinics.profile.notConfirmed');
  const hasContact = clinic.contact.phone !== null || clinic.contact.email !== null;
  const contactVerified = clinic.contact.verification === 'verified';
  const addressVerified = clinic.address.verification === 'verified' && clinic.address.text !== null;
  // De-duplicate and keep the API order.
  const unknowns = [...new Set(clinic.unknowns)];
  // The request link appears only when the clinic's booking config loads (enabled). A 404 means no requests here.
  const booking = useBookingConfig(clinic.slug);
  const bookingOff = booking.error instanceof ApiRequestError && booking.error.status === 404;

  return (
    <article className="clinic-profile" data-demo={clinic.isDemo ? 'true' : undefined}>
      <Link to="/clinics" className="back-link">
        <ArrowLeft size={18} aria-hidden="true" /> {t('clinics.profile.back')}
      </Link>
      <h1>{clinic.name}</h1>
      <DemoLabel isDemo={clinic.isDemo} />
      {clinic.isDemo && (
        <p className="demo-banner-inline" data-testid="clinic-demo-banner">
          {t('clinics.profile.demoBanner')}
        </p>
      )}
      {clinic.description && <p className="article__summary">{clinic.description}</p>}

      <section aria-labelledby="cp-verify">
        <h2 id="cp-verify">{t('clinics.verify.heading')}</h2>
        <VerificationNote verification={clinic.verification} />
        {clinic.verification.source && (
          <p className="field-hint">
            {t('clinics.verify.source')}: {clinic.verification.source}
          </p>
        )}
      </section>

      <section aria-labelledby="cp-location">
        <h2 id="cp-location">{t('clinics.profile.location')}</h2>
        <dl className="fact-dl">
          <dt>{t('clinics.filter.municipality')}</dt>
          <dd>{clinic.municipality}</dd>
          {clinic.barangay && (
            <>
              <dt>{t('clinics.profile.barangay')}</dt>
              <dd>{clinic.barangay}</dd>
            </>
          )}
          <dt>{t('clinics.profile.address')}</dt>
          <dd>
            {clinic.address.text !== null ? (
              <>
                {clinic.address.text}
                {!addressVerified && <> {unconfirmed}</>}
              </>
            ) : (
              t('clinics.profile.addressUnknown')
            )}
          </dd>
          {clinic.contact.phone !== null && (
            <>
              <dt>{t('clinics.profile.phone')}</dt>
              <dd>
                {clinic.contact.phone}
                {!contactVerified && <> {unconfirmed}</>}
              </dd>
            </>
          )}
          {clinic.contact.email !== null && (
            <>
              <dt>{t('clinics.profile.email')}</dt>
              <dd>
                {clinic.contact.email}
                {!contactVerified && <> {unconfirmed}</>}
              </dd>
            </>
          )}
        </dl>
        {clinic.contact.note !== null && <p>{clinic.contact.note}</p>}
        {!hasContact && !contactVerified && <p className="field-hint">{t('clinics.profile.contactUnknown')}</p>}
      </section>

      <section aria-labelledby="cp-services">
        <h2 id="cp-services">{t('clinics.profile.services')}</h2>
        {clinic.services.length === 0 ? (
          <p>{t('clinics.card.noServices')}</p>
        ) : (
          <ul className="fact-list">
            {clinic.services.map((s) => {
              const state = serviceState(s);
              return (
                <li key={s.category} data-state={state}>
                  {t(`clinics.service.${s.category}`)}: <strong>{t(`clinics.service.${state}`)}</strong>
                  {state === 'available' && <> · {t(feeKey(s.fee))}</>}
                  {s.fee.note && state === 'available' && s.fee.verification === 'verified' && <> ({s.fee.note})</>}
                  {s.verifiedAt && state !== 'unknown' && <span className="field-hint"> · {formatDate(locale, s.verifiedAt)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="cp-practices">
        <h2 id="cp-practices">{t('clinics.profile.practices')}</h2>
        <p className="field-hint">{t('clinics.profile.practices.note')}</p>
        <ul className="fact-list">
          {PRIVACY_PRACTICE_KEYS.map((key) => {
            const p = clinic.practices.find((x) => x.key === key);
            const state = p ? practiceState(p) : 'unknown';
            return (
              <li key={key} data-state={state}>
                {t(`clinics.practice.${key}`)}: <strong>{t(`clinics.practice.${state}`)}</strong>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cp-unknowns" className="state-box" data-testid="clinic-unknowns">
        <h2 id="cp-unknowns">{t('clinics.profile.unknowns')}</h2>
        {unknowns.length === 0 ? (
          <p>{t('clinics.profile.unknowns.none')}</p>
        ) : (
          <>
            <p>{t('clinics.profile.unknowns.note')}</p>
            <ul className="fact-list">
              {unknowns.map((k) => (
                <li key={k}>{unknownLabel(k)}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="actions">
        <BookingCta clinicSlug={clinic.slug} enabled={booking.isSuccess} />
        <Link to="/pathway" className="btn btn--secondary">
          <ShieldCheck size={18} aria-hidden="true" /> {t('clinics.profile.pathway')}
        </Link>
      </div>
      {bookingOff && <p className="field-hint">{t('clinics.booking.unavailable')}</p>}
    </article>
  );
}

export function ClinicProfile() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { data, isPending, error } = useClinic(id);

  const back = (
    <Link to="/clinics" className="back-link">
      <ArrowLeft size={18} aria-hidden="true" /> {t('clinics.profile.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className="clinic-profile">
        {back}
        <h1>{t('clinics.title')}</h1>
        <p aria-live="polite">{t('clinics.profile.loading')}</p>
      </div>
    );
  }
  if (error || !data) {
    const notFound = error instanceof ApiRequestError && error.kind === 'http' && error.status === 404;
    return (
      <div className="clinic-profile">
        {back}
        <h1>{notFound ? t('clinics.profile.notFound.title') : t('clinics.title')}</h1>
        <p role="alert">{notFound ? t('clinics.profile.notFound.body') : t('clinics.profile.error')}</p>
      </div>
    );
  }
  return <Profile clinic={data} />;
}
