import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { URGENT_ARTICLE_SLUG } from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';

/** Prominent route to the separate urgent possible-recent-exposure article (professional assessment first). */
export function UrgentPepBanner() {
  const { t } = useI18n();
  return (
    <section className="urgent-banner" aria-labelledby="urgent-banner-title">
      <TriangleAlert className="urgent-banner__icon" size={28} aria-hidden="true" />
      <div className="urgent-banner__copy">
        <h2 id="urgent-banner-title">{t('learn.urgent.title')}</h2>
        <p>{t('learn.urgent.body')}</p>
        <Link to={`/learn/${URGENT_ARTICLE_SLUG}`} className="btn btn--primary">
          {t('learn.urgent.cta')}
        </Link>
      </div>
    </section>
  );
}
