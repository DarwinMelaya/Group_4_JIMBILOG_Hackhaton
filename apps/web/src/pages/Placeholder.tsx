import type { MessageId } from '../i18n/catalog';
import { useI18n } from '../i18n/I18nProvider';

export function Placeholder({ titleId }: { titleId: MessageId }) {
  const { t } = useI18n();
  return (
    <section className="placeholder">
      <h1>{t(titleId)}</h1>
      <p>{t('placeholder.body')}</p>
    </section>
  );
}
