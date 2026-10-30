import {
  CLINIC_SERVICE_CATEGORIES,
  PRIVACY_PRACTICE_KEYS,
  type ClinicPractice,
  type ClinicService,
  type ClinicSummary,
  type ClinicServiceCategory,
  type PrivacyPracticeKey,
} from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/format';

/**
 * Display rules shared by the directory, the profile and the pathway results:
 * a fact is shown as definite only when the API marks it verified. Everything else reads "Not confirmed"
 * (never "available", "free", "safe" or "private" by omission).
 */

export function isServiceCategory(v: string): v is ClinicServiceCategory {
  return (CLINIC_SERVICE_CATEGORIES as readonly string[]).includes(v);
}
export function isPracticeKey(v: string): v is PrivacyPracticeKey {
  return (PRIVACY_PRACTICE_KEYS as readonly string[]).includes(v);
}

export type ServiceState = 'available' | 'unavailable' | 'unknown';
export function serviceState(s: Pick<ClinicService, 'availability' | 'verification'>): ServiceState {
  if (s.verification !== 'verified') return 'unknown';
  return s.availability;
}

/** Fee text key: a fee tier is only named when it is verified; otherwise "Fee not confirmed". */
export function feeKey(fee: ClinicService['fee']): 'clinics.fee.free' | 'clinics.fee.low' | 'clinics.fee.standard' | 'clinics.fee.unknown' {
  if (fee.verification !== 'verified') return 'clinics.fee.unknown';
  switch (fee.tier) {
    case 'free':
      return 'clinics.fee.free';
    case 'low':
      return 'clinics.fee.low';
    case 'standard':
      return 'clinics.fee.standard';
    default:
      return 'clinics.fee.unknown';
  }
}

export function practiceState(p: Pick<ClinicPractice, 'confirmed' | 'status' | 'verification'>): 'confirmed' | 'not_supported' | 'unknown' {
  if (p.confirmed) return 'confirmed';
  if (p.status === 'not_supported' && p.verification === 'verified') return 'not_supported';
  return 'unknown';
}

export function DemoLabel({ isDemo }: { isDemo: boolean }) {
  const { t } = useI18n();
  if (!isDemo) return null;
  return <strong className="demo-chip">{t('clinics.label.demo')}</strong>;
}

/** Verification level + freshness, with the date. Stale and never-verified are called out explicitly. */
export function VerificationNote({ verification }: { verification: Pick<ClinicSummary['verification'], 'level' | 'lastVerifiedAt' | 'freshness'> }) {
  const { t, locale } = useI18n();
  const { level, lastVerifiedAt, freshness } = verification;
  const effective = lastVerifiedAt === null ? 'never' : freshness;
  const date = lastVerifiedAt !== null ? ` ${formatDate(locale, lastVerifiedAt)}` : '';
  return (
    <p className="verify-note" data-freshness={effective}>
      <span>{t(`clinics.verify.level.${level}`)}</span>
      {' · '}
      <span>
        {t(`clinics.verify.${effective}`)}
        {effective === 'never' ? '' : date}
      </span>
    </p>
  );
}
