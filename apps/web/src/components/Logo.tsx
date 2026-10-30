import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

/** Logo mark (kalinga-logo.png) plus text wordmark. */
export function Logo() {
  const { t } = useI18n();
  return (
    <Link to="/" className="logo" aria-label={t('brand.homeLabel')}>
      <img className="logo__mark" src="/icons/kalinga-logo.png" alt="" width="32" height="32" />
      <span>KALINGA</span>
      <span className="logo__badge">DEMO</span>
    </Link>
  );
}
