import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from '@kalinga/shared';
import { CATALOGS, HTML_LANG, hasUnreviewed, translate, type MessageId } from './catalog';
import { detectInitialLocale, storeLocale } from './locale-storage';

export interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (id: MessageId) => string;
  /** True when the active locale has any entry not marked reviewed (shows the review notice). */
  needsReviewNotice: boolean;
  /** Text for the single polite live region; set only after a language change, in the new language. */
  announcement: string;
}

/** Without a provider the hook degrades to static English (no switching), so isolated component renders still work. */
const DEFAULT_VALUE: I18nValue = {
  locale: 'en',
  setLocale: () => undefined,
  t: (id) => translate('en', id),
  needsReviewNotice: false,
  announcement: '',
};

const I18nContext = createContext<I18nValue>(DEFAULT_VALUE);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectInitialLocale());
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      if (l !== locale) setAnnouncement(translate(l, `locale.announce.${l}`));
      setLocaleState(l);
      storeLocale(l);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (id) => translate(locale, id),
      needsReviewNotice: locale === 'fil' && hasUnreviewed(CATALOGS.fil),
      announcement,
    }),
    [locale, setLocale, announcement],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
