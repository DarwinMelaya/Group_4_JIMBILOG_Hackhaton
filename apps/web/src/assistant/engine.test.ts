import { describe, expect, it } from 'vitest';
import { CATALOGS, type MessageId } from '../i18n/catalog';
import { MAX_INPUT_LENGTH, clampInput, matchIntent, normalize } from './engine';
import { INTENTS, getIntent, quickReplies, quickRepliesFor } from './registry';

const ids = (s: string) => matchIntent(s).id;

describe('normalize and clamp', () => {
  it('lower-cases, strips accents and punctuation', () => {
    expect(normalize('  Where, to START?! ')).toBe('where to start');
    expect(normalize('Café')).toBe('cafe');
  });
  it('caps free text at 200 characters', () => {
    expect(MAX_INPUT_LENGTH).toBe(200);
    expect(clampInput('a'.repeat(500))).toHaveLength(200);
    expect(clampInput('short')).toBe('short');
  });
});

describe('matchIntent: English and Filipino keywords', () => {
  it.each([
    ['where do I start', 'start'],
    ['I am new here', 'start'],
    ['what are the symptoms of an infection', 'learn'],
    ['tell me about STIs', 'learn'],
    ['where can I get tested', 'clinic'],
    ['find a clinic please', 'clinic'],
    ['I want to speak to a real person', 'human'],
    ['can I talk to a doctor', 'human'],
    ['change the language', 'language'],
    ['Filipino please', 'language'],
    ['saan magsisimula', 'start'],
    ['gusto kong magbasa ng impormasyon', 'learn'],
    ['saan magpapasuri', 'clinic'],
    ['gusto ko ng totoong tao', 'human'],
    ['palitan ang wika', 'language'],
  ])('%s -> %s', (text, expected) => {
    expect(ids(text)).toBe(expected);
  });

  it('is case, accent and punctuation insensitive and deterministic', () => {
    expect(ids('FIND A CLINIC!!!')).toBe(ids('find a clinic'));
    expect(ids('find a clinic')).toBe(ids('find a clinic'));
  });
});

describe('urgent 72h path', () => {
  it.each([
    'possible HIV exposure in the last 72 hours',
    'the condom broke last night',
    'I think I was exposed',
    'PEP',
    'emergency',
    'may pagkakalantad ako sa HIV',
    'pumutok ang condom kagabi',
    'agarang tulong',
  ])('%s -> urgent', (text) => {
    expect(ids(text)).toBe('urgent');
  });

  it('wins over other topics in the same message (safety first)', () => {
    expect(ids('where can I get tested clinic after exposure')).toBe('urgent');
    expect(ids('learn about sti, I was exposed 2 days ago')).toBe('urgent');
  });

  it('is flagged urgent and points to Clinics only (no invented contacts)', () => {
    const urgent = getIntent('urgent');
    expect(urgent.urgent).toBe(true);
    expect(urgent.links.map((l) => l.to)).toEqual(['/clinics']);
  });
});

describe('fallback', () => {
  it.each(['', '   ', 'asdf qwer', 'what is the weather', '!!!', 'a'.repeat(300)])('%j -> fallback', (text) => {
    expect(ids(text)).toBe('fallback');
  });
  it('ignores keywords beyond the 200 character cap', () => {
    expect(ids(`${'x'.repeat(200)} clinic`)).toBe('fallback');
  });
});

describe('registry shape', () => {
  it('has unique ids and every link goes to an in-app path', () => {
    const seen = new Set(INTENTS.map((i) => i.id));
    expect(seen.size).toBe(INTENTS.length);
    for (const i of INTENTS) for (const l of i.links) expect(l.to).toMatch(/^\/[a-z/-]*$/);
  });
  it('offers the six required quick replies', () => {
    expect(quickReplies().map((i) => i.id)).toEqual(['urgent', 'start', 'learn', 'clinic', 'human', 'language']);
  });
  it('only matchable intents have keywords; greeting and fallback have none', () => {
    for (const id of ['greeting', 'fallback'] as const) {
      expect(getIntent(id).keywords.en).toHaveLength(0);
      expect(getIntent(id).keywords.fil).toHaveLength(0);
    }
  });
});

/** Every message ID the registry references, resolved in both locales. */
function allReplyTexts(): { locale: 'en' | 'fil'; id: MessageId; text: string }[] {
  const out: { locale: 'en' | 'fil'; id: MessageId; text: string }[] = [];
  for (const locale of ['en', 'fil'] as const) {
    for (const i of INTENTS) {
      const refs: MessageId[] = [i.replyId, ...('titleId' in i ? [i.titleId] : []), ...('chipId' in i ? [i.chipId] : []), ...('contextChipId' in i ? [i.contextChipId] : []), ...i.links.map((l) => l.labelId)];
      for (const id of refs) out.push({ locale, id, text: CATALOGS[locale][id].text });
    }
  }
  return out;
}

describe('safety of the scripted text (en + fil)', () => {
  const texts = allReplyTexts();

  it('every assistant catalog entry is flagged unreviewed in both locales', () => {
    for (const locale of ['en', 'fil'] as const) {
      const entries = Object.entries(CATALOGS[locale]).filter(([k]) => k.startsWith('assistant.'));
      expect(entries.length).toBeGreaterThan(20);
      for (const [, entry] of entries) expect(entry.review).toBe('unreviewed');
    }
  });

  it('contains no diagnosis or treatment-instruction wording', () => {
    const banned = [
      /you (have|likely have|probably have|are infected|are positive|are hiv)/i,
      /you do not have|you don't have|you are (not infected|negative|safe|fine)/i,
      /\b(take|start|use) (the |this |these )?(pep|pill|pills|medicine|medication|drug|drugs|antiretroviral)/i,
      /\b(dose|dosage|prescri)|\d\s?mg\b/i,
      /(may|positibo|negatibo) (ka|ang iyong)|ikaw ay (may|positibo|negatibo|ligtas)|wala kang (hiv|sti|impeksyon)|uminom ka|inumin mo/i,
    ];
    for (const { locale, id, text } of texts) {
      for (const re of banned) expect(text, `${locale}:${id}`).not.toMatch(re);
    }
  });

  it('invents no phone numbers, emails, URLs or hotlines', () => {
    for (const { locale, id, text } of texts) {
      expect(text, `${locale}:${id}`).not.toMatch(/@|https?:|www\.|\.com\b|\+?\d[\d\s-]{5,}/i);
      expect(text, `${locale}:${id}`).not.toMatch(/\b(hotline|call us|dial)\b/i);
    }
  });

  it('urgent reply asks for professional assessment, mentions it cannot assess or advise, and states DEMO', () => {
    const en = CATALOGS.en['assistant.reply.urgent'].text;
    expect(en).toMatch(/qualified health professional/i);
    expect(en).toMatch(/cannot assess/i);
    expect(en).toMatch(/treatment/i);
    expect(en).toMatch(/DEMO/);
    expect(CATALOGS.en['assistant.reply.urgent.title'].text).toMatch(/72 hours/);
    const fil = CATALOGS.fil['assistant.reply.urgent'].text;
    expect(fil).toMatch(/propesyonal sa kalusugan/i);
    expect(fil).toMatch(/DEMO/);
    expect(CATALOGS.fil['assistant.reply.urgent.title'].text).toMatch(/72 oras/);
  });

  it('human handoff states no clinician is connected and points to Clinics', () => {
    const human = getIntent('human');
    expect(human.links.map((l) => l.to)).toContain('/clinics');
    expect(CATALOGS.en['assistant.reply.human'].text).toMatch(/No clinician is connected in this DEMO/);
    expect(CATALOGS.fil['assistant.reply.human'].text).toMatch(/Walang klinisyan na nakakonekta/);
  });
});

describe('SA-2: final-site intents (en + fil)', () => {
  it.each([
    ['how do I request an appointment', 'booking'],
    ['I want to book an appointment', 'booking'],
    ['paano humiling ng appointment', 'booking'],
    ['gusto kong mag-book', 'booking'],
    ['check my request status', 'status'],
    ['I lost my secret code', 'status'],
    ['sumagot ba ang klinika', 'status'],
    ['will I get a reminder', 'reminders'],
    ['mga paalala', 'reminders'],
    ['what is on a clinic profile', 'profile'],
    ['what are the opening hours', 'profile'],
    ['help me choose', 'pathway'],
    ['what happens after testing', 'care'],
    ['when are my test results ready', 'results'],
    ['tell me about the articles', 'learn'],
    ['change language to Filipino', 'language'],
  ])('%s -> %s', (text, expected) => {
    expect(ids(text)).toBe(expected);
  });

  it('urgent still wins over every new intent', () => {
    expect(ids('how do I book an appointment, I was exposed last night')).toBe('urgent');
    expect(ids('reminder: possible exposure 72 hours ago')).toBe('urgent');
    expect(ids('check my request status, pep')).toBe('urgent');
  });

  it('booking explains a request is not a confirmation and links to clinics and the status page', () => {
    const b = getIntent('booking');
    expect(b.links.map((l) => l.to)).toEqual(['/clinics', '/appointments/lookup']);
    expect(CATALOGS.en['assistant.reply.booking'].text).toMatch(/request, not a confirmation/);
    expect(CATALOGS.fil['assistant.reply.booking'].text).toMatch(/hindi kumpirmasyon/);
  });

  it('reminders reply says opt-in, neutral and DEMO mock only', () => {
    const en = CATALOGS.en['assistant.reply.reminders'].text;
    expect(en).toMatch(/optional/);
    expect(en).toMatch(/neutral/);
    expect(en).toMatch(/mock only/);
    expect(CATALOGS.fil['assistant.reply.reminders'].text).toMatch(/mock lamang/);
  });

  it('never mentions staff sign-in, in any intent keyword, link or reply', () => {
    for (const i of INTENTS) {
      for (const l of i.links) expect(l.to).not.toMatch(/staff|admin/);
      for (const locale of ['en', 'fil'] as const) {
        expect(CATALOGS[locale][i.replyId].text).not.toMatch(/staff|admin/i);
      }
    }
  });

  it('human handoff offers a DEMO clinic request or a real clinic, without inventing contacts', () => {
    const en = CATALOGS.en['assistant.reply.human'].text;
    expect(en).toMatch(/No clinician is connected in this DEMO/);
    expect(en).toMatch(/request an appointment with a DEMO clinic/);
    expect(en).toMatch(/real health professional or clinic/);
    expect(en).not.toMatch(/later version/);
    expect(CATALOGS.fil['assistant.reply.human'].text).not.toMatch(/susunod na bersyon/);
  });
});

describe('SA-2: page-aware quick replies', () => {
  const idsFor = (p: string) => quickRepliesFor(p).map((i) => i.id);

  it('keeps the default six on the home page and on unrelated routes', () => {
    const base = quickReplies().map((i) => i.id);
    for (const p of ['/', '/nope', '/clinicsx', '/staff']) expect(idsFor(p)).toEqual(base);
  });

  it('always offers urgent first and a real person last, never more than six', () => {
    for (const p of ['/', '/learn', '/learn/some-article', '/clinics', '/clinics/demo-clinic-a', '/clinics/demo-clinic-a/request', '/pathway', '/appointments/lookup', '/care', '/care/results', '/menu']) {
      const r = idsFor(p);
      expect(r[0], p).toBe('urgent');
      expect(r, p).toContain('human');
      if (r.join() !== quickReplies().map((i) => i.id).join()) expect(r[r.length - 1], p).toBe('human');
      expect(r.length, p).toBeLessThanOrEqual(6);
      expect(new Set(r).size, p).toBe(r.length);
    }
  });

  it('prefers chips relevant to the current page', () => {
    expect(idsFor('/clinics/demo-clinic-a')).toEqual(expect.arrayContaining(['booking', 'profile']));
    expect(idsFor('/appointments/lookup')).toEqual(expect.arrayContaining(['status', 'reminders', 'booking']));
    expect(idsFor('/care/results')).toContain('care');
    expect(idsFor('/pathway')).toContain('pathway');
    expect(idsFor('/learn/some-article')[1]).toBe('learn');
    expect(idsFor('/menu')).toContain('language');
  });
});
