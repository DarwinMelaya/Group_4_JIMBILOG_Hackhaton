import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export function Home() {
  const { t } = useI18n();
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <h1 id="hero-title">{t('home.hero.title')}</h1>
          <p>{t('home.hero.body')}</p>
          <div className="actions">
            <Link to="/clinics" className="btn btn--primary">{t('home.hero.ctaClinics')}</Link>
            <Link to="/learn" className="btn btn--secondary">{t('home.hero.ctaLearn')}</Link>
          </div>
          <p className="hero__note">{t('home.hero.privacyNote')}</p>
        </div>
        <div className="hero__art" aria-hidden="true">
          <Compass size={96} strokeWidth={1.5} />
        </div>
      </section>
      <section className="card" aria-labelledby="urgent-title">
        <h2 id="urgent-title">{t('home.urgent.title')}</h2>
        <p>{t('home.urgent.body')}</p>
      </section>
    </>
  );
}
