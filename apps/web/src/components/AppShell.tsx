import { Outlet } from 'react-router-dom';
import { Logo } from './Logo';
import { NavLinks } from './NavLinks';
import { EnvStatus } from './EnvStatus';
import { LocaleSwitch } from './LocaleSwitch';
import { UpdatePrompt } from './UpdatePrompt';
import { AssistantWidget } from '../assistant/AssistantWidget';
import { useI18n } from '../i18n/I18nProvider';

export function AppShell() {
  const { t, needsReviewNotice, announcement, announcementId } = useI18n();
  return (
    <>
      <a href="#main" className="skip-link">{t('a11y.skipToContent')}</a>
      {/* Single polite live region for language-change announcements (not role=status; that is the review notice). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="locale-announcer">
        {/* New key per switch remounts the node, so identical text (same locale re-selected) is announced again. */}
        {announcement && <span key={announcementId}>{announcement}</span>}
      </div>
      <div className="demo-banner" role="note">
        {t('banner.demo')} <strong className="demo-banner__marker">{t('banner.notReviewed')}</strong>
      </div>
      {needsReviewNotice && (
        // Bilingual: the English phrase (lang=en) and its Filipino rendering (lang=fil), each tagged on its own span.
        <div className="review-notice" role="status">
          <span lang="en">{t('notice.filUnreviewed')}</span>
          {' / '}
          <span lang="fil">{t('notice.filUnreviewedLocal')}</span>
        </div>
      )}
      <UpdatePrompt />
      <header className="site-header">
        <div className="site-header__inner">
          <Logo />
          <NavLinks variant="primary" />
          <LocaleSwitch />
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
      <EnvStatus />
      <NavLinks variant="mobile" />
      <AssistantWidget />
    </>
  );
}
