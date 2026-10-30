import { Link } from 'react-router-dom';
import { LocaleSwitch } from '../components/LocaleSwitch';
import { useI18n } from '../i18n/I18nProvider';

export function Menu() {
  const { t } = useI18n();
  return (
    <section className="placeholder">
      <h1>{t('placeholder.menu')}</h1>
      <p>{t('placeholder.body')}</p>
      <h2>{t('menu.language.title')}</h2>
      <p>{t('menu.language.help')}</p>
      <LocaleSwitch />
      <h2>{t('menu.requests.title')}</h2>
      <p>{t('menu.requests.help')}</p>
      <p>
        <Link to="/appointments/lookup" className="btn btn--secondary">
          {t('menu.requests.lookup')}
        </Link>
      </p>
      <h2>{t('care.nav.link')}</h2>
      <p>{t('care.nav.help')}</p>
      <p>
        <Link to="/care" className="btn btn--secondary">
          {t('care.nav.link')}
        </Link>
      </p>
      <h2>{t('staff.menu.title')}</h2>
      <p>{t('staff.menu.help')}</p>
      <p>
        <Link to="/staff/login" className="btn btn--secondary">
          {t('staff.menu.link')}
        </Link>
      </p>
      <h2>{t('admin.menu.title')}</h2>
      <p>{t('admin.menu.help')}</p>
      <p>
        <Link to="/admin/login" className="btn btn--secondary">
          {t('admin.menu.link')}
        </Link>
      </p>
    </section>
  );
}
