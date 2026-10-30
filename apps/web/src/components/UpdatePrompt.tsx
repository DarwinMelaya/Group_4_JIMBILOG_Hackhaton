import { useId, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { updateController, type UpdateController } from '../pwa/update';

/** Non-modal prompt shown only while a new app version is waiting. Nothing reloads until the user accepts. */
export function UpdatePrompt({ controller = updateController }: { controller?: UpdateController }) {
  const { t } = useI18n();
  const titleId = useId();
  const available = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => false);
  if (!available) return null;
  return (
    <section className="update-prompt" aria-labelledby={titleId}>
      <p id={titleId} className="update-prompt__title" role="status">
        {t('update.title')}
      </p>
      <p className="update-prompt__body">{t('update.body')}</p>
      <div className="update-prompt__actions">
        <button type="button" className="btn btn--primary" onClick={() => controller.accept()}>
          {t('update.reload')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => controller.dismiss()}>
          {t('update.later')}
        </button>
      </div>
    </section>
  );
}
