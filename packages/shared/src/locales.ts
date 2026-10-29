export const LOCALES = ['en', 'fil'] as const;
export type Locale = (typeof LOCALES)[number];
