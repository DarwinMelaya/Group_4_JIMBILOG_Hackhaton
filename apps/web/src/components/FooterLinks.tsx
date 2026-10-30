import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageId } from '../i18n/catalog';

const LINKS: readonly { to: string; id: MessageId }[] = [
  { to: '/learn', id: 'nav.learn' },
  { to: '/clinics', id: 'nav.clinics' },
  { to: '/pathway', id: 'landing.care.cta' },
  { to: '/care', id: 'care.nav.link' },
  { to: '/menu', id: 'nav.menu' },
];

/** Footer link list inside the single contentinfo landmark (a plain list, not a nav, so the two labelled navs stay unique). */
export function FooterLinks() {
  const { t } = useI18n();
  return (
    <div className="footer-links">
      <p className="footer-links__title">{t('landing.footer.title')}</p>
      <ul className="footer-links__list">
        {LINKS.map(({ to, id }) => (
          <li key={to}><Link to={to}>{t(id)}</Link></li>
        ))}
      </ul>
      <p className="footer-links__note">{t('landing.footer.privacy')}</p>
      <p className="footer-links__note">{t('landing.footer.contact')}</p>
    </div>
  );
}
