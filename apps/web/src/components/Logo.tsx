import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

/** Temporary text wordmark. NOT an official logo: production artwork is blocked on brand approval. */
export function Logo() {
  const { t } = useI18n();
  return (
    <Link to="/" className="logo" aria-label={t('brand.homeLabel')}>
      <span>KALINGA</span>
      <span className="logo__badge">DEMO</span>
    </Link>
  );
}
