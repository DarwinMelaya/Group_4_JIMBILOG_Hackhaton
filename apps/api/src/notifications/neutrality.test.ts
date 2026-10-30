import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { LOCALES } from '@kalinga/shared';
import { STAFF_A, createBooking, login, makeHarness, type Harness } from '../staff/test-support.js';
import { allReminderTemplates, renderNeutralReminder } from './render.js';

/** Words that must never appear in a reminder: they could expose a purpose, a place or a credential. */
const BANNED = [
  /\bhiv\b/i,
  /\bsti\b/i,
  /\bsti\/hiv\b/i,
  /\btest(s|ing)?\b/i,
  /\bpositive\b/i,
  /\bnegative\b/i,
  /\bresult(s)?\b/i,
  /\bprep\b/i,
  /\bpep\b/i,
  /\bcondom/i,
  /\bclinic\b/i,
  /\bdemo\b/i,
  /\bappointment\b/i,
  /\bbooking\b/i,
  /\bKAL-/i,
  /\bsecret\b/i,
  /\breference\b/i,
  // Filipino equivalents
  /\bpagsusuri\b/i,
  /\bresulta\b/i,
  /\bklinika\b/i,
  /\bsekreto\b/i,
  /\bhiv\b/i,
  /\d{4}-\d{2}-\d{2}/,
  /\d{1,2}:\d{2}/,
];

const cr = (b: { reference: string; secret: string }): { reference: string; secret: string } => ({ reference: b.reference, secret: b.secret });
let h: Harness;
beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.db.close();
});

describe('reminder neutrality', () => {
  it('every template (EN and FIL) is free of banned terms, dates, times and identifiers', () => {
    const all = allReminderTemplates();
    expect(all.length).toBe(LOCALES.length);
    for (const text of all) {
      for (const re of BANNED) expect(text, `${re} in "${text}"`).not.toMatch(re);
      expect(text.length).toBeLessThanOrEqual(200);
    }
  });

  it('renders per locale and differs between EN and FIL', () => {
    expect(renderNeutralReminder('en')).not.toBe(renderNeutralReminder('fil'));
    expect(renderNeutralReminder('en')).toMatch(/KALINGA/);
  });

  it.each(['en', 'fil'] as const)('the text actually stored in the outbox (%s) contains no clinic, reference, secret or service', async (locale) => {
    const app = h.build();
    const staff = await login(app, STAFF_A);
    const b = await createBooking(app, h.db, { service: undefined });
    await request(app)
      .patch(`/api/v1/staff/clinics/demo-clinic-a/booking-requests/${b.id}/status`)
      .set('Cookie', staff.cookie)
      .set('X-CSRF-Token', staff.csrf)
      .set('If-Match', '"1"')
      .send({ status: 'confirmed', visitDate: '2026-11-05', visitTime: '10:00' })
      .expect(200);
    const res = await request(app).post('/api/v1/public/booking-requests/reminders').send({ ...cr(b), optIn: true, channel: 'mock_email', locale });
    expect(res.status).toBe(200);
    const out = await request(app).get('/api/v1/dev/outbox');
    const item = (out.body.items as { renderedText: string; locale: string }[]).find((i) => i.locale === locale);
    expect(item).toBeDefined();
    const text = item?.renderedText ?? '';
    const clinic = await h.db.query<{ name: string; slug: string }>('select name, slug from clinics where slug = $1', ['demo-clinic-a']);
    const forbidden = [b.reference, b.secret, clinic.rows[0]?.name ?? 'x-never', clinic.rows[0]?.slug ?? 'x-never'];
    for (const f of forbidden) expect(text.toLowerCase()).not.toContain(f.toLowerCase());
    for (const re of BANNED) expect(text, `${re}`).not.toMatch(re);
    expect(text).toBe(renderNeutralReminder(locale === 'fil' ? 'fil' : 'en'));
  });
});

describe('notifications module has no network transport', () => {
  it('no source file in this directory imports an HTTP/socket/SMTP client or calls fetch', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(0);
    for (const f of sources) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code, f).not.toMatch(/from ['"](node:)?(http|https|net|tls|dgram|dns)['"]/);
      expect(code, f).not.toMatch(/from ['"](axios|node-fetch|nodemailer|twilio|undici|got)['"]/);
      expect(code, f).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
