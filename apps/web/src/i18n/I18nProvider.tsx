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
  /**
   * Increments on every user-initiated switch, even to the same locale or with identical text.
   * Render the announcement under `key={announcementId}` so assistive tech sees a fresh node each time.
   */
  announcementId: number;
}

/** Without a provider the hook degrades to static English (no switching), so isolated component renders still work. */
const DEFAULT_VALUE: I18nValue = {
  locale: 'en',
  setLocale: () => undefined,
  t: (id) => translate('en', id),
  needsReviewNotice: false,
  announcement: '',
  announcementId: 0,
};

const I18nContext = createContext<I18nValue>(DEFAULT_VALUE);

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectInitialLocale());
  const [announce, setAnnounce] = useState({ text: '', id: 0 });

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  // Stable callback: announces on EVERY user switch (re-selecting the current locale included); the pure
  // updater only bumps a counter, so StrictMode double-invocation cannot duplicate anything. Storage is written once per call.
  const setLocale = useCallback((l: Locale) => {
    setAnnounce((prev) => ({ text: translate(l, `locale.announce.${l}`), id: prev.id + 1 }));
    setLocaleState(l);
    storeLocale(l);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (id) => translate(locale, id),
      needsReviewNotice: locale === 'fil' && hasUnreviewed(CATALOGS.fil),
      announcement: announce.text,
      announcementId: announce.id,
    }),
    [locale, setLocale, announce],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
