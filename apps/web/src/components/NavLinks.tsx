import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './nav';
import { useI18n } from '../i18n/I18nProvider';

export function NavLinks({ variant }: { variant: 'primary' | 'mobile' }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t(variant === 'primary' ? 'nav.primary' : 'nav.mobile')}
      className={variant === 'primary' ? 'top-nav' : 'bottom-nav'}
    >
      <ul className="nav-list">
        {NAV_ITEMS.map(({ to, labelId, icon: Icon }) => (
          <li key={to}>
            <NavLink to={to} end={to === '/'} className="nav-link">
              <Icon size={24} strokeWidth={2} aria-hidden="true" />
              <span>{t(labelId)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
