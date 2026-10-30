import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export interface BookingCtaProps {
  clinicSlug: string;
  /**
   * Off until booking requests exist (S5-2). When false the component renders nothing at all: no disabled button,
   * no "coming soon" placeholder. S5-2 turns it on by passing `enabled` (and, if needed, a different `to`).
   */
  enabled?: boolean;
  /** Router path of the request flow. Defaults to `/clinics/<slug>/request`. */
  to?: string;
}

/** Link slot for "send a request to this clinic". Renders nothing until enabled. */
export function BookingCta({ clinicSlug, enabled = false, to }: BookingCtaProps) {
  const { t } = useI18n();
  if (!enabled) return null;
  return (
    <Link to={to ?? `/clinics/${encodeURIComponent(clinicSlug)}/request`} className="btn btn--primary">
      {t('clinics.booking.cta')}
    </Link>
  );
}
