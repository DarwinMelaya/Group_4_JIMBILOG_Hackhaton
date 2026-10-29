import { useId } from 'react';
import { LOCALES } from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';

/**
 * Button names stay the endonyms ("English", "Filipino", each with its own lang) so users can find
 * their language in any locale. The localized descriptive label is exposed via aria-describedby.
 */
export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  const uid = useId();
  return (
    <div className="locale-switch" role="group" aria-label={t('locale.switchLabel')}>
      {LOCALES.map((l) => {
        const descId = `${uid}-${l}`;
        return (
          <span key={l} className="locale-switch__item">
            <button
              type="button"
              className="locale-switch__btn"
              lang={l}
              aria-pressed={locale === l}
              aria-describedby={descId}
              onClick={() => setLocale(l)}
            >
              {t(`locale.${l}`)}
            </button>
            <span id={descId} className="sr-only">{t(`locale.use.${l}`)}</span>
          </span>
        );
      })}
    </div>
  );
}
