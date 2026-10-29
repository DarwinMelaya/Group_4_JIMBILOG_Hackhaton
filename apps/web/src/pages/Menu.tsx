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
    </section>
  );
}
