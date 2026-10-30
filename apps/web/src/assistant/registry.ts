import type { Locale } from '@kalinga/shared';
import type { MessageId } from '../i18n/catalog';

/**
 * Data-driven intent registry for the scripted DEMO guide.
 *
 * To add an intent or route (e.g. SA-2): append one entry to INTENTS, add its message IDs to the en/fil
 * catalogs (flagged unreviewed), and the engine, widget and quick replies pick it up. No other code changes.
 * All response text lives in the i18n catalogs (never here), so EN/FIL parity and review flags stay enforced.
 */

/** In-app route link. `to` is a router path; rendered with the router `Link`, never a raw anchor. */
export interface IntentLink {
  to: string;
  labelId: MessageId;
}

/** A button inside a reply that performs a local UI action (no network, nothing persisted by the guide). */
export interface IntentAction {
  type: 'setLocale';
  locale: Locale;
  labelId: MessageId;
}

export interface Intent {
  id: string;
  /** Keywords per language; matched as whole words/phrases after lower-casing and accent stripping. Empty = not matchable. */
  keywords: { readonly en: readonly string[]; readonly fil: readonly string[] };
  /** Reply text. */
  replyId: MessageId;
  /** Optional prominent heading for urgent replies. */
  titleId?: MessageId;
  links: readonly IntentLink[];
  actions?: readonly IntentAction[];
  /** Urgent intents win over every other match and render as a prominent professional-assessment block. */
  urgent?: boolean;
  /** Present = the intent is offered as a quick-reply chip with this label. Chip order follows registry order. */
  chipId?: MessageId;
  /** Chip label shown only on the routes below (never in the default set). */
  contextChipId?: MessageId;
  /** Route prefixes where this intent is relevant: "/clinics" matches "/clinics" and "/clinics/abc", not "/clinicsx". */
  routes?: readonly string[];
}

export const INTENTS = [
  {
    id: 'greeting',
    keywords: { en: [], fil: [] },
    replyId: 'assistant.reply.greeting',
    links: [],
  },
  {
    id: 'urgent',
    urgent: true,
    keywords: {
      en: [
        '72', '72 hours', '72 hour', 'pep', 'post exposure', 'hiv exposure', 'possible exposure', 'exposure', 'exposed',
        'urgent', 'urgently', 'emergency', 'unprotected', 'condom broke', 'condom slipped', 'just had sex',
      ],
      fil: [
        '72 oras', 'agarang', 'kagyat', 'emerhensya', 'pagkakalantad', 'nalantad', 'walang proteksyon',
        'pumutok ang condom', 'kakagawa lang',
      ],
    },
    chipId: 'assistant.chip.urgent',
    titleId: 'assistant.reply.urgent.title',
    replyId: 'assistant.reply.urgent',
    links: [{ to: '/clinics', labelId: 'nav.clinics' }],
  },
  {
    id: 'start',
    keywords: {
      en: ['where to start', 'where do i start', 'start', 'begin', 'get started', 'new here', 'what can you do'],
      fil: ['saan magsisimula', 'saan ako magsisimula', 'magsimula', 'simula'],
    },
    chipId: 'assistant.chip.start',
    replyId: 'assistant.reply.start',
    links: [
      { to: '/learn', labelId: 'nav.learn' },
      { to: '/clinics', labelId: 'nav.clinics' },
    ],
  },
  {
    id: 'learn',
    keywords: {
      en: ['learn', 'sti', 'stis', 'std', 'stds', 'sexually transmitted', 'infection', 'infections', 'symptom', 'symptoms', 'information', 'article', 'articles', 'read'],
      fil: ['alamin', 'impormasyon', 'sti', 'impeksyon', 'sintomas', 'magbasa', 'basahin'],
    },
    chipId: 'assistant.chip.learn',
    routes: ['/learn'],
    replyId: 'assistant.reply.learn',
    links: [{ to: '/learn', labelId: 'nav.learn' }],
  },
  {
    id: 'clinic',
    keywords: {
      en: ['clinic', 'clinics', 'test', 'tested', 'testing', 'where can i get tested', 'screening', 'appointment', 'hospital'],
      fil: ['klinika', 'mga klinika', 'magpasuri', 'pagpapasuri', 'pagsusuri', 'saan magpapasuri', 'ospital'],
    },
    chipId: 'assistant.chip.clinic',
    routes: ['/clinics', '/pathway'],
    replyId: 'assistant.reply.clinic',
    links: [{ to: '/clinics', labelId: 'nav.clinics' }],
  },
  {
    id: 'pathway',
    keywords: {
      en: ['pathway', 'narrow down', 'which clinic', 'compare clinics', 'testing options', 'help me choose', 'recommend a clinic'],
      fil: ['paliitin ang pagpipilian', 'aling klinika', 'ihambing ang klinika', 'mga opsyon sa pagpapasuri', 'tulungan akong pumili'],
    },
    contextChipId: 'assistant.chip.pathway',
    routes: ['/pathway', '/clinics'],
    replyId: 'assistant.reply.pathway',
    links: [
      { to: '/pathway', labelId: 'pathway.title' },
      { to: '/clinics', labelId: 'nav.clinics' },
    ],
  },
  {
    id: 'results',
    keywords: {
      en: ['results', 'result', 'test results', 'lab results', 'get my results', 'when are results ready'],
      fil: ['resulta', 'mga resulta', 'kunin ang resulta', 'resulta ng pagsusuri'],
    },
    replyId: 'assistant.reply.results',
    links: [
      { to: '/care/results', labelId: 'care.results.title' },
      { to: '/care', labelId: 'care.nav.link' },
    ],
  },
  {
    id: 'care',
    keywords: {
      en: ['treatment', 'referral', 'refer', 'next steps', 'next step', 'after testing', 'prepare', 'preparing', 'before my visit', 'care navigation', 'follow up'],
      fil: ['paggamot', 'referral', 'susunod na hakbang', 'pagkatapos ng pagsusuri', 'maghanda', 'paghahanda', 'gabay sa pangangalaga'],
    },
    contextChipId: 'assistant.chip.care',
    routes: ['/care'],
    replyId: 'assistant.reply.care',
    links: [
      { to: '/care', labelId: 'care.nav.link' },
      { to: '/care/treatment-and-referral', labelId: 'care.treatment.title' },
      { to: '/care/preparing-for-your-visit', labelId: 'care.prepare.title' },
    ],
  },
  {
    id: 'profile',
    keywords: {
      en: ['clinic profile', 'profile', 'opening hours', 'open hours', 'what services', 'services offered', 'verified', 'verification', 'fees', 'cost', 'how much'],
      fil: ['profile ng klinika', 'oras ng bukas', 'mga serbisyo', 'anong serbisyo', 'beripikado', 'bayad', 'magkano'],
    },
    contextChipId: 'assistant.chip.profile',
    routes: ['/clinics'],
    replyId: 'assistant.reply.profile',
    links: [{ to: '/clinics', labelId: 'nav.clinics' }],
  },
  {
    id: 'booking',
    keywords: {
      en: [
        'request an appointment', 'how do i request an appointment', 'book', 'booking', 'book an appointment', 'make an appointment',
        'schedule', 'schedule a visit', 'reserve', 'send a request', 'request a visit',
      ],
      fil: [
        'humiling ng appointment', 'paano humiling ng appointment', 'mag book', 'magpa book', 'magpa iskedyul', 'mag iskedyul',
        'kahilingan', 'magpadala ng request', 'mag request',
      ],
    },
    contextChipId: 'assistant.chip.booking',
    routes: ['/clinics', '/appointments'],
    replyId: 'assistant.reply.booking',
    links: [
      { to: '/clinics', labelId: 'nav.clinics' },
      { to: '/appointments/lookup', labelId: 'lookup.title' },
    ],
  },
  {
    id: 'status',
    keywords: {
      en: ['status', 'check my request', 'check a request', 'my request', 'my appointment', 'did the clinic reply', 'lookup', 'look up', 'secret code', 'reference number'],
      fil: ['katayuan', 'suriin ang kahilingan', 'aking kahilingan', 'sumagot ba ang klinika', 'lihim na code', 'reference number'],
    },
    contextChipId: 'assistant.chip.status',
    routes: ['/appointments'],
    replyId: 'assistant.reply.status',
    links: [{ to: '/appointments/lookup', labelId: 'lookup.title' }],
  },
  {
    id: 'reminders',
    keywords: {
      en: ['reminder', 'reminders', 'remind me', 'notification', 'notifications', 'text message', 'sms'],
      fil: ['paalala', 'mga paalala', 'ipaalala', 'abiso', 'mga abiso'],
    },
    contextChipId: 'assistant.chip.reminders',
    routes: ['/appointments'],
    replyId: 'assistant.reply.reminders',
    links: [{ to: '/appointments/lookup', labelId: 'lookup.title' }],
  },
  {
    id: 'human',
    keywords: {
      en: [
        'real person', 'real human', 'human', 'professional', 'doctor', 'nurse', 'counselor', 'counsellor', 'clinician',
        'talk to someone', 'speak to someone', 'talk to a person', 'speak to a person',
      ],
      fil: ['totoong tao', 'propesyonal', 'doktor', 'nars', 'tagapayo', 'kausapin', 'makausap', 'makipag usap'],
    },
    chipId: 'assistant.chip.human',
    replyId: 'assistant.reply.human',
    links: [{ to: '/clinics', labelId: 'nav.clinics' }],
  },
  {
    id: 'language',
    keywords: {
      en: ['language', 'filipino', 'tagalog', 'english', 'translate', 'translation'],
      fil: ['wika', 'salita', 'ingles', 'isalin', 'salin', 'filipino', 'tagalog'],
    },
    chipId: 'assistant.chip.language',
    routes: ['/menu'],
    replyId: 'assistant.reply.language',
    links: [{ to: '/menu', labelId: 'nav.menu' }],
    actions: [
      { type: 'setLocale', locale: 'en', labelId: 'locale.use.en' },
      { type: 'setLocale', locale: 'fil', labelId: 'locale.use.fil' },
    ],
  },
  {
    id: 'fallback',
    keywords: { en: [], fil: [] },
    replyId: 'assistant.reply.fallback',
    links: [],
  },
] as const satisfies readonly Intent[];

export type IntentId = (typeof INTENTS)[number]['id'];

/** Widened view for generic iteration (the literal tuple above exists only to derive IntentId). */
export const ALL_INTENTS: readonly Intent[] = INTENTS;

/** The intent shown when nothing matches. */
export const FALLBACK_INTENT_ID: IntentId = 'fallback';
/** The first message of every conversation. */
export const GREETING_INTENT_ID: IntentId = 'greeting';

export function getIntent(id: IntentId): Intent {
  const found = ALL_INTENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown intent: ${id}`);
  return found;
}

/** Default quick-reply chips in registry order (used on the home page and on routes with no route-specific chips). */
export function quickReplies(): readonly Intent[] {
  return ALL_INTENTS.filter((i) => i.chipId !== undefined);
}

/** Maximum chips shown at once. */
export const MAX_CHIPS = 6;

/** The label a chip shows: the default label, or the route-specific one. */
export function chipLabelId(intent: Intent): MessageId | undefined {
  return intent.chipId ?? intent.contextChipId;
}

function routeMatches(intent: Intent, pathname: string): boolean {
  return (intent.routes ?? []).some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Page-aware chips. Where no intent is tied to the current route the default set is returned unchanged. Otherwise: the urgent
 * chip first, then chips relevant to this page, then the default chips, with "talk to a real person" always last.
 * Capped at MAX_CHIPS; the urgent and human chips are never dropped.
 */
export function quickRepliesFor(pathname: string): readonly Intent[] {
  const relevant = ALL_INTENTS.filter((i) => i.urgent !== true && i.id !== 'human' && chipLabelId(i) !== undefined && routeMatches(i, pathname));
  if (relevant.length === 0) return quickReplies();
  const urgent = ALL_INTENTS.filter((i) => i.urgent === true && i.chipId !== undefined);
  const human = ALL_INTENTS.filter((i) => i.id === 'human');
  const rest = quickReplies().filter((i) => i.urgent !== true && i.id !== 'human' && !relevant.includes(i));
  const room = MAX_CHIPS - urgent.length - human.length;
  return [...urgent, ...[...relevant, ...rest].slice(0, room), ...human];
}
