import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AdminArticleListSchema, type AdminArticle } from '@kalinga/shared';
import { ADMIN, auditRows, call, loginAll, makeEditorialArticle, makeHarness, type App, type Harness, type Sessions } from './test-support.js';

let h: Harness;
let app: App;
let S: Sessions;

const T0 = '2026-10-30T04:00:00Z';
const REVIEWER = 'Dr. Maria L. Santos';

beforeAll(async () => {
  h = await makeHarness();
  app = h.build();
  S = await loginAll(app);
});
afterAll(async () => {
  await h.db.close();
});
beforeEach(() => {
  h.clock.now = new Date(T0);
  h.logs.length = 0;
});

const path = (slug: string, locale: string) => `${ADMIN}/articles/${slug}/localizations/${locale}/transition`;

async function find(slug: string): Promise<AdminArticle> {
  const res = await call(app, S.prov, 'get', `${ADMIN}/articles`);
  const a = AdminArticleListSchema.parse(res.body).items.find((x) => x.slug === slug);
  if (!a) throw new Error('article not listed');
  return a;
}
const loc = (a: AdminArticle, locale: string) => {
  const l = a.localizations.find((x) => x.locale === locale);
  if (!l) throw new Error('locale missing');
  return l;
};
async function move(slug: string, locale: 'en' | 'fil', to: string, extra: Record<string, unknown> = {}) {
  h.clock.now = new Date(h.clock.now.getTime() + 1000); // keeps audit timestamps ordered
  const v = loc(await find(slug), locale).version;
  return call(app, S.prov, 'post', path(slug, locale), { to, expectedVersion: v, ...extra });
}
const review = { reviewerName: REVIEWER, reviewedOn: '2026-10-29' };

describe('per-locale editorial review lifecycle', () => {
  it('walks draft, in_review, medically_reviewed, published for one locale without touching the other', async () => {
    const art = await makeEditorialArticle(h.db, 'life');
    expect(loc(await find(art.slug), 'en')).toMatchObject({ reviewState: 'draft', allowedTransitions: ['in_review'] });

    expect((await move(art.slug, 'en', 'in_review')).body).toMatchObject({ reviewState: 'in_review', locale: 'en' });
    const rev = await move(art.slug, 'en', 'medically_reviewed', review);
    expect(rev.body).toMatchObject({ reviewState: 'medically_reviewed', reviewerName: REVIEWER, medicallyReviewedAt: '2026-10-29' });
    expect((await move(art.slug, 'en', 'published')).body).toMatchObject({ reviewState: 'published', reviewerName: REVIEWER });

    // No approval is inherited: Filipino is still a draft with no reviewer, and is NOT served publicly.
    const after = await find(art.slug);
    expect(loc(after, 'fil')).toMatchObject({ reviewState: 'draft', reviewerName: null, medicallyReviewedAt: null });
    expect((await request(app).get(`/api/v1/public/articles/${art.slug}?locale=en`)).status).toBe(200);
    expect((await request(app).get(`/api/v1/public/articles/${art.slug}?locale=fil`)).status).toBe(404);
  });

  it('gives every locale its own reviewer and date, and refuses to skip steps', async () => {
    const art = await makeEditorialArticle(h.db, 'skip');
    // Cannot jump to reviewed/published from draft (no approval by shortcut or by inheritance from English).
    for (const to of ['medically_reviewed', 'published']) {
      const r = await move(art.slug, 'fil', to, to === 'medically_reviewed' ? review : {});
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code: 'invalid_transition' } });
    }
    await move(art.slug, 'en', 'in_review');
    await move(art.slug, 'en', 'medically_reviewed', review);
    // English being reviewed does not let Filipino go from in_review to published.
    await move(art.slug, 'fil', 'in_review');
    expect((await move(art.slug, 'fil', 'published')).status).toBe(409);
    const filRev = await move(art.slug, 'fil', 'medically_reviewed', { reviewerName: 'Ana B. Reyes', reviewedOn: '2026-10-30' });
    expect(filRev.body).toMatchObject({ reviewerName: 'Ana B. Reyes', medicallyReviewedAt: '2026-10-30' });
    const a = await find(art.slug);
    expect(loc(a, 'en').reviewerName).toBe(REVIEWER);
    expect(loc(a, 'fil').reviewerName).toBe('Ana B. Reyes');
  });

  it('requires a named human reviewer and a real, non-future review date', async () => {
    const art = await makeEditorialArticle(h.db, 'who');
    await move(art.slug, 'en', 'in_review');
    expect((await move(art.slug, 'en', 'medically_reviewed')).status).toBe(400);
    expect((await move(art.slug, 'en', 'medically_reviewed', { reviewerName: REVIEWER })).status).toBe(400);
    for (const name of ['Claude', 'AI reviewer', 'Automated check', 'KALINGA bot', 'Dr. <b>x</b>', '12345']) {
      expect((await move(art.slug, 'en', 'medically_reviewed', { reviewerName: name, reviewedOn: '2026-10-29' })).status).toBe(400);
    }
    expect((await move(art.slug, 'en', 'medically_reviewed', { reviewerName: REVIEWER, reviewedOn: '2026-02-30' })).status).toBe(400);
    const future = await move(art.slug, 'en', 'medically_reviewed', { reviewerName: REVIEWER, reviewedOn: '2026-12-31' });
    expect(future.status).toBe(422);
    expect(future.body).toMatchObject({ error: { code: 'reviewed_on_future' } });
    // Reviewer fields on other moves are rejected rather than ignored.
    expect((await move(art.slug, 'en', 'draft', review)).status).toBe(400);
    expect(loc(await find(art.slug), 'en')).toMatchObject({ reviewState: 'in_review', reviewerName: null });
  });

  it('clears the reviewer when content goes back to draft or in_review, and checks versions', async () => {
    const art = await makeEditorialArticle(h.db, 'back');
    await move(art.slug, 'en', 'in_review');
    await move(art.slug, 'en', 'medically_reviewed', review);
    await move(art.slug, 'en', 'published');
    const back = await move(art.slug, 'en', 'in_review');
    expect(back.body).toMatchObject({ reviewState: 'in_review', reviewerName: null, medicallyReviewedAt: null });
    const stale = await call(app, S.prov, 'post', path(art.slug, 'en'), { to: 'draft', expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'version_conflict' } });
    expect((await request(app).get(`/api/v1/public/articles/${art.slug}?locale=en`)).status).toBe(404);
  });

  it('refuses a medical review for content without sections and references', async () => {
    const art = await makeEditorialArticle(h.db, 'norefs');
    await h.db.query(`update article_localizations set "references" = '[]'::jsonb where article_id = $1 and locale = 'en'`, [art.id]);
    await move(art.slug, 'en', 'in_review');
    const r = await move(art.slug, 'en', 'medically_reviewed', review);
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: { code: 'references_required' } });
  });

  it('returns 404 for unknown articles, locales and malformed slugs', async () => {
    expect((await call(app, S.prov, 'post', path('no-such-article', 'en'), { to: 'in_review', expectedVersion: 1 })).status).toBe(404);
    expect((await call(app, S.prov, 'post', path('sti-basics-overview', 'de'), { to: 'in_review', expectedVersion: 1 })).status).toBe(404);
    expect((await call(app, S.prov, 'post', path('Bad_Slug', 'en'), { to: 'in_review', expectedVersion: 1 })).status).toBe(404);
  });
});

describe('DEMO content can never be reviewed or published', () => {
  it('allows draft/in_review for a demo article but refuses medically_reviewed and published with a clean 409', async () => {
    const slug = 'sti-basics-overview';
    expect((await find(slug)).contentOrigin).toBe('demo');
    expect((await move(slug, 'en', 'in_review')).status).toBe(200);
    for (const to of ['medically_reviewed', 'published']) {
      const r = await move(slug, 'en', to, to === 'medically_reviewed' ? review : {});
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ error: { code: 'demo_content_locked' } });
    }
    const row = await h.db.query<{ review_state: string; reviewer_name: string | null }>(
      `select l.review_state, l.reviewer_name from article_localizations l join articles a on a.id = l.article_id where a.slug = $1 and l.locale = 'en'`,
      [slug],
    );
    expect(row.rows[0]).toEqual({ review_state: 'in_review', reviewer_name: null });
  });

  it('still has the database trigger as a second guard', async () => {
    await expect(
      h.db.query(`update article_localizations set review_state = 'medically_reviewed', reviewer_name = 'X Y', medically_reviewed_at = '2026-10-01'
                  where article_id = (select id from articles where slug = 'common-stis-overview') and locale = 'en'`),
    ).rejects.toThrow(/demo articles cannot be medically reviewed or published/);
  });
});

describe('authorisation and audit', () => {
  it('is provincial-admin only: 401 without a session, 403 for every other role, CSRF required on writes', async () => {
    const art = await makeEditorialArticle(h.db, 'authz');
    const body = { to: 'in_review', expectedVersion: 1 };
    expect((await call(app, null, 'get', `${ADMIN}/articles`)).status).toBe(401);
    expect((await call(app, null, 'post', path(art.slug, 'en'), body)).status).toBe(401);
    for (const s of [S.tech, S.adminA, S.staffA]) {
      expect((await call(app, s, 'get', `${ADMIN}/articles`)).status).toBe(403);
      expect((await call(app, s, 'post', path(art.slug, 'en'), body)).status).toBe(403);
    }
    const noCsrf = await call(app, S.prov, 'post', path(art.slug, 'en'), body, false);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body).toMatchObject({ error: { code: 'csrf_rejected' } });
    expect(loc(await find(art.slug), 'en').reviewState).toBe('draft');
  });

  it('audits every transition with the locale and states but never the reviewer name', async () => {
    await h.db.exec('truncate audit_events');
    const art = await makeEditorialArticle(h.db, 'aud');
    await move(art.slug, 'fil', 'in_review');
    await move(art.slug, 'fil', 'medically_reviewed', { reviewerName: 'Zebediah Quill', reviewedOn: '2026-10-29' });
    await move(art.slug, 'fil', 'draft'); // invalid from medically_reviewed: no event
    const rows = await auditRows(h.db, 'governance.article_review_changed');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.metadata).toMatchObject({ locale: 'fil', from_status: 'draft', to_status: 'in_review' });
    expect(rows.every((r) => r.target_type === 'article_localization' && r.actor_user_id !== null)).toBe(true);
    const dump = JSON.stringify(await auditRows(h.db)) + h.logs.join('\n');
    expect(dump).not.toContain('Zebediah');
  });
});
