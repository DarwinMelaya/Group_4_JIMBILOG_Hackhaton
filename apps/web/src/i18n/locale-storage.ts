import { LOCALES, type Locale } from '@kalinga/shared';

export const LOCALE_STORAGE_KEY = 'kalinga.locale';

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function readStoredLocale(): Locale | null {
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* storage unavailable: the choice is simply not persisted */
  }
}

/** Map BCP-47 tags (fil, fil-PH, tl, tl-PH) to a supported locale; default en. */
export function localeFromNavigator(langs?: readonly string[]): Locale {
  let list: readonly string[] = [];
  if (langs) list = langs;
  else if (typeof navigator !== 'undefined') {
    list = navigator.languages?.length ? navigator.languages : [navigator.language];
  }
  for (const tag of list) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'fil' || base === 'tl') return 'fil';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function detectInitialLocale(): Locale {
  return readStoredLocale() ?? localeFromNavigator();
}
