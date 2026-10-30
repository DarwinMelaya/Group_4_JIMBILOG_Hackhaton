import type { Locale, ReminderKind } from '@kalinga/shared';

/**
 * Pure, deterministic NEUTRAL reminder text (master prompt F08). It must be safe on a lock screen or a shared phone:
 * no clinic name, no service, no health or testing wording, no booking reference or secret, no date or time that could
 * identify the purpose. It only tells the person that something is waiting inside the app.
 *
 * The Filipino text is a draft and unreviewed (DEMO), like every other Filipino string in this prototype.
 */
const TEXT: Record<ReminderKind, Record<Locale, string>> = {
  visit_reminder: {
    en: 'You have a reminder from your health service. Open KALINGA to view details.',
    fil: 'May paalala ka mula sa iyong serbisyong pangkalusugan. Buksan ang KALINGA para makita ang mga detalye.',
  },
};

export function renderNeutralReminder(locale: Locale, kind: ReminderKind = 'visit_reminder'): string {
  return TEXT[kind][locale];
}

/** Every template, for tests that scan all of them against the banned-terms list. */
export function allReminderTemplates(): string[] {
  return Object.values(TEXT).flatMap((byLocale) => Object.values(byLocale));
}
