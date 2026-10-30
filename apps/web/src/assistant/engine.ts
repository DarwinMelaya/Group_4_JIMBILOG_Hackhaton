import { ALL_INTENTS, FALLBACK_INTENT_ID, getIntent, type Intent } from './registry';

/**
 * Deterministic, local rule engine for the DEMO guide. Pure functions only: no network, no storage,
 * no logging, no randomness, no model. Same input always gives the same intent.
 */

/** Free-text cap (characters). Also enforced on the input element via maxLength. */
export const MAX_INPUT_LENGTH = 200;

export function clampInput(input: string): string {
  return input.slice(0, MAX_INPUT_LENGTH);
}

/** Lower-case, strip accents, turn punctuation into spaces, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function score(padded: string, intent: Intent): number {
  let total = 0;
  for (const kw of [...intent.keywords.en, ...intent.keywords.fil]) {
    const n = normalize(kw);
    // Whole word/phrase match; longer phrases weigh more, so "where can i get tested" beats a lone "sti".
    if (n && padded.includes(` ${n} `)) total += n.split(' ').length;
  }
  return total;
}

/**
 * Pick the intent for free text. Urgent intents win over everything (safety first); otherwise the highest score,
 * ties broken by registry order. No match returns the fallback intent. Input is clamped to MAX_INPUT_LENGTH.
 */
export function matchIntent(input: string): Intent {
  const padded = ` ${normalize(clampInput(input))} `;
  if (padded.trim() === '') return getIntent(FALLBACK_INTENT_ID);
  let best: Intent | undefined;
  let bestScore = 0;
  for (const intent of ALL_INTENTS) {
    const s = score(padded, intent);
    if (s === 0) continue;
    if (intent.urgent === true) return intent;
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }
  return best ?? getIntent(FALLBACK_INTENT_ID);
}
