import { useSyncExternalStore, type ReactNode } from 'react';
import { usePublicConfig } from '../api/usePublicConfig';
import { useI18n } from '../i18n/I18nProvider';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Live browser connectivity: re-renders on window online/offline events (unknown counts as online). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );
}

/** Footer status line: environment state as reported by GET /api/v1/public/config. */
export function EnvStatus({ children }: { children?: ReactNode } = {}) {
  const { t } = useI18n();
  const { data, isPending, isError } = usePublicConfig();
  const online = useOnlineStatus();
  const offline = !online;

  let text: string;
  if (data) {
    text = [
      data.demoMode ? t('env.demo') : t('env.nonDemo'),
      t('env.notifications.mock'),
      t('env.booking.disabled'),
    ].join(' · ');
  } else if (isError) {
    text = offline ? t('env.offline') : t('env.error');
  } else {
    text = isPending ? t('env.loading') : t('env.error');
  }

  return (
    <footer className="site-footer">
      {children}
      <p className="env-status" aria-live="polite" data-state={data ? 'ready' : isError ? 'error' : 'loading'}>
        <span className="env-status__label">{t('env.label')}</span> {text}
      </p>
    </footer>
  );
}
