import { usePublicConfig } from '../api/usePublicConfig';
import { useI18n } from '../i18n/I18nProvider';

/** Footer status line: environment state as reported by GET /api/v1/public/config. */
export function EnvStatus() {
  const { t } = useI18n();
  const { data, isPending, isError } = usePublicConfig();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

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
      <p className="env-status" aria-live="polite" data-state={data ? 'ready' : isError ? 'error' : 'loading'}>
        <span className="env-status__label">{t('env.label')}</span> {text}
      </p>
    </footer>
  );
}
