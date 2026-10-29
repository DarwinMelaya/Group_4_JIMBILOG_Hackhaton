import type { Locale } from '@kalinga/shared';

/** Per-entry review state. Nothing in this prototype is medically approved. */
export type ReviewState = 'unreviewed' | 'reviewed';

export interface CatalogEntry {
  text: string;
  review: ReviewState;
}

const u = (text: string): CatalogEntry => ({ text, review: 'unreviewed' });

/** English is the source catalog; its keys define the stable message IDs. */
export const en = {
  'brand.homeLabel': u('KALINGA (DEMO) home'),
  'a11y.skipToContent': u('Skip to content'),
  'banner.demo': u(
    'DEMO prototype: sample content only. Not a real service, no real clinics, and nothing here is medical advice.',
  ),
  'notice.filUnreviewed': u('Filipino translation not yet medically reviewed'),
  'banner.notReviewed': u('NOT CLINICALLY REVIEWED'),
  'notice.filUnreviewedLocal': u('Filipino translation not yet medically reviewed'),
  'locale.use.en': u('Switch the language to English'),
  'locale.use.fil': u('Switch the language to Filipino'),
  'locale.announce.en': u('Language changed to English'),
  'locale.announce.fil': u('Language changed to Filipino'),
  'menu.language.title': u('Language'),
  'menu.language.help': u('Choose the language for this app. Filipino text is a draft and has not been medically reviewed.'),
  'nav.primary': u('Primary'),
  'nav.mobile': u('Mobile'),
  'nav.home': u('Home'),
  'nav.learn': u('Learn'),
  'nav.clinics': u('Clinics'),
  'nav.menu': u('Menu'),
  'locale.switchLabel': u('Language'),
  'locale.en': u('English'),
  'locale.fil': u('Filipino'),
  'home.hero.title': u('Care without judgment. Guidance without fear.'),
  'home.hero.body': u(
    'Explore testing options and learn what to expect, at your own pace. KALINGA is a guide, not a diagnosis.',
  ),
  'home.hero.ctaClinics': u('Explore Testing Options'),
  'home.hero.ctaLearn': u('Learn About STIs'),
  'home.hero.privacyNote': u(
    'We do not ask you to sign in. Each clinic states its own confidentiality procedures; check them before you decide.',
  ),
  'home.urgent.title': u('Need help urgently?'),
  'home.urgent.body': u('Urgent care guidance is a placeholder in this DEMO and has not been medically reviewed.'),
  'placeholder.learn': u('Learn'),
  'placeholder.clinics': u('Clinics'),
  'placeholder.menu': u('Menu'),
  'placeholder.body': u('This page is a placeholder in the DEMO prototype. Content is coming in a later slice.'),
  'notFound.title': u('Page not found'),
  'env.label': u('Environment:'),
  'env.loading': u('checking status...'),
  'env.error': u('status unavailable right now. The rest of the app still works.'),
  'env.offline': u('you appear to be offline. Public pages may still be available.'),
  'env.demo': u('DEMO environment'),
  'env.nonDemo': u('Non-demo environment'),
  'env.notifications.mock': u('notifications are mock only'),
  'env.booking.disabled': u('real booking is disabled'),
} as const satisfies Record<string, CatalogEntry>;

export type MessageId = keyof typeof en;
export type Catalog = Record<MessageId, CatalogEntry>;

/** Filipino draft translations. All entries are unreviewed and must stay flagged until a qualified reviewer signs off. */
export const fil: Catalog = {
  'brand.homeLabel': u('KALINGA (DEMO) tahanan'),
  'a11y.skipToContent': u('Lumaktaw sa nilalaman'),
  'banner.demo': u(
    'DEMO prototype: sample na nilalaman lamang. Hindi ito totoong serbisyo, walang totoong klinika, at walang payong medikal dito.',
  ),
  'notice.filUnreviewed': u('Filipino translation not yet medically reviewed'),
  'banner.notReviewed': u('HINDI PA SINURI NG MEDIKAL (NOT CLINICALLY REVIEWED)'),
  'notice.filUnreviewedLocal': u('Ang salin sa Filipino ay hindi pa nasusuri ng medikal na tagasuri'),
  'locale.use.en': u('Ilipat ang wika sa English'),
  'locale.use.fil': u('Ilipat ang wika sa Filipino'),
  'locale.announce.en': u('Napalitan ang wika sa English'),
  'locale.announce.fil': u('Napalitan ang wika sa Filipino'),
  'menu.language.title': u('Wika'),
  'menu.language.help': u('Piliin ang wika ng app na ito. Draft lamang ang tekstong Filipino at hindi pa ito nasusuri ng medikal na tagasuri.'),
  'nav.primary': u('Pangunahin'),
  'nav.mobile': u('Mobile'),
  'nav.home': u('Tahanan'),
  'nav.learn': u('Alamin'),
  'nav.clinics': u('Mga Klinika'),
  'nav.menu': u('Menu'),
  'locale.switchLabel': u('Wika'),
  'locale.en': u('English'),
  'locale.fil': u('Filipino'),
  'home.hero.title': u('Pangangalagang walang paghuhusga. Gabay na walang takot.'),
  'home.hero.body': u(
    'Tuklasin ang mga opsyon sa pagpapasuri at alamin ang aasahan, sa sarili mong bilis. Ang KALINGA ay gabay, hindi diagnosis.',
  ),
  'home.hero.ctaClinics': u('Tuklasin ang mga Opsyon sa Pagpapasuri'),
  'home.hero.ctaLearn': u('Alamin ang Tungkol sa mga STI'),
  'home.hero.privacyNote': u(
    'Hindi ka namin hinihinging mag-sign in. Ang bawat klinika ay may sariling patakaran sa pagiging kumpidensyal; suriin ito bago magpasya.',
  ),
  'home.urgent.title': u('Kailangan ng agarang tulong?'),
  'home.urgent.body': u(
    'Placeholder lamang sa DEMO na ito ang gabay para sa agarang pangangalaga at hindi pa ito nasusuri ng medikal na tagasuri.',
  ),
  'placeholder.learn': u('Alamin'),
  'placeholder.clinics': u('Mga Klinika'),
  'placeholder.menu': u('Menu'),
  'placeholder.body': u(
    'Placeholder lamang ang pahinang ito sa DEMO prototype. Darating ang nilalaman sa susunod na slice.',
  ),
  'notFound.title': u('Hindi nahanap ang pahina'),
  'env.label': u('Kapaligiran:'),
  'env.loading': u('sinusuri ang status...'),
  'env.error': u('hindi available ang status ngayon. Gumagana pa rin ang ibang bahagi ng app.'),
  'env.offline': u('mukhang offline ka. Maaaring magamit pa rin ang mga pampublikong pahina.'),
  'env.demo': u('DEMO na kapaligiran'),
  'env.nonDemo': u('Hindi DEMO na kapaligiran'),
  'env.notifications.mock': u('mock lamang ang mga abiso'),
  'env.booking.disabled': u('naka-disable ang totoong booking'),
};

export const CATALOGS: Record<Locale, Catalog> = { en, fil };

export const HTML_LANG: Record<Locale, string> = { en: 'en', fil: 'fil' };

/** Message IDs present in `base` but absent (or empty) in `other`. */
export function findMissingKeys(base: Record<string, unknown>, other: Record<string, unknown>): string[] {
  return Object.keys(base).filter((k) => !(k in other) || !(other[k] as CatalogEntry | undefined)?.text);
}

/** Message IDs present in `other` but not in `base` (stale/extra keys). */
export function findExtraKeys(base: Record<string, unknown>, other: Record<string, unknown>): string[] {
  return Object.keys(other).filter((k) => !(k in base));
}

export function hasUnreviewed(catalog: Catalog): boolean {
  return Object.values(catalog).some((e) => e.review !== 'reviewed');
}

const reported = new Set<string>();
export type MissingKeyReporter = (locale: Locale, id: string) => void;
let reporter: MissingKeyReporter = (locale, id) => {
  const key = `${locale}:${id}`;
  if (reported.has(key)) return;
  reported.add(key);
  console.warn(`[i18n] missing message "${id}" for locale "${locale}"`);
};

export function setMissingKeyReporter(fn: MissingKeyReporter): void {
  reporter = fn;
}

/** Resolve a message; falls back to English and reports the miss explicitly. Never throws. */
export function translate(locale: Locale, id: string): string {
  const entry = (CATALOGS[locale] as Record<string, CatalogEntry | undefined>)[id];
  if (entry?.text) return entry.text;
  reporter(locale, id);
  const fallback = (en as Record<string, CatalogEntry | undefined>)[id];
  return fallback?.text ?? id;
}
