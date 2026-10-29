import type { Locale } from '@kalinga/shared';

export const TIME_ZONE = 'Asia/Manila';

const INTL_LOCALE: Record<Locale, string> = { en: 'en-PH', fil: 'fil-PH' };

export function formatDateTime(
  locale: Locale,
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

export function formatDate(locale: Locale, value: Date | number | string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: 'medium', timeZone: TIME_ZONE }).format(
    new Date(value),
  );
}

export function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

export function formatCurrencyPHP(locale: Locale, value: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'PHP' }).format(value);
}
