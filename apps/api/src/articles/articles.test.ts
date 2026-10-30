import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { PGlite } from '@electric-sql/pglite';
import {
  ARTICLE_TOPICS,
  ArticleDetailSchema,
  ArticleListResponseSchema,
  URGENT_ARTICLE_SLUG,
} from '@kalinga/shared';
import { createApp } from '../app.js';
import { openDatabase } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { loadEnv } from '../env.js';
import { silentLogger } from '../http/logger.js';
import { escapeLike } from './repository.js';

const demoEnv = loadEnv({});
let db: PGlite;
let app: ReturnType<typeof createApp>;
let prodApp: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await openDatabase();
  await seedDemoData(db, demoEnv);
  app = createApp({ env: demoEnv, logger: silentLogger, db });
  // Non-demo configuration over the SAME database: demo rows must never be served.
  prodApp = createApp({
    env: loadEnv({ NODE_ENV: 'production', DEMO_MODE: 'false' }),
    logger: silentLogger,
    db,
  });
});
afterAll(async () => {
  await db.close();
});

async function insertEditorial(slug: string, state: string, reviewer: string | null, date: string | null) {
  const a = await db.query<{ id: string }>(
    `insert into articles (slug, topic, content_origin) values ($1, 'basics', 'editorial') returning id`,
    [slug],
  );
  await db.query(
    `insert into article_localizations (article_id, locale, title, summary, review_state, reviewer_name, medically_reviewed_at)
     values ($1, 'en', $2, 'fixture summary', $3::article_review_state, $4, $5::date)`,
    [a.rows[0]?.id, `Fixture ${slug}`, state, reviewer, date],
  );
}

describe('seed loader', () => {
  it('is idempotent and refuses non-demo or non-dev environments', async () => {
    await seedDemoData(db, demoEnv);
    const n = await db.query<{ n: number }>(`select count(*)::int as n from articles where content_origin = 'demo'`);
    expect(n.rows[0]?.n).toBe(ARTICLE_TOPICS.length);
    await expect(seedDemoData(db, { DEMO_MODE: false, NODE_ENV: 'development' })).rejects.toThrow(/DEMO_MODE=true/);
    await expect(seedDemoData(db, { DEMO_MODE: true, NODE_ENV: 'production' })).rejects.toThrow(/development or test/);
    await expect(seedDemoData(db, { DEMO_MODE: true, NODE_ENV: 'staging' })).rejects.toThrow(/development or test/);
  });

  it('seeds only unreviewed demo rows, bilingual, one article per topic', async () => {
    const r = await db.query<{ review_state: string; reviewer_name: string | null; content_origin: string }>(
      `select l.review_state, l.reviewer_name, a.content_origin from article_localizations l
       join articles a on a.id = l.article_id where a.content_origin = 'demo'`,
    );
    expect(r.rows.length).toBe(ARTICLE_TOPICS.length * 2);
    for (const row of r.rows) {
      expect(row).toMatchObject({ review_state: 'draft', reviewer_name: null, content_origin: 'demo' });
    }
  });
});

describe('DB publish-safety constraints', () => {
  it('rejects published or medically_reviewed rows without reviewer name and date', async () => {
    await expect(insertEditorial('fixture-bad-1', 'published', null, null)).rejects.toThrow();
    await expect(insertEditorial('fixture-bad-2', 'medically_reviewed', 'A. Reviewer (fixture)', null)).rejects.toThrow();
    await expect(insertEditorial('fixture-bad-3', 'published', null, '2026-01-01')).rejects.toThrow();
  });

  it('rejects publishing or reviewing a demo article', async () => {
    await expect(
      db.query(
        `update article_localizations set review_state = 'published', reviewer_name = 'X', medically_reviewed_at = '2026-01-01'
         where article_id = (select id from articles where slug = 'prevention-overview')`,
      ),
    ).rejects.toThrow(/demo articles/);
  });

  it('rejects unknown topics, bad slugs and bad locales', async () => {
    await expect(db.query(`insert into articles (slug, topic) values ('ok-slug', 'cure-all')`)).rejects.toThrow();
    await expect(db.query(`insert into articles (slug, topic) values ('Bad Slug', 'basics')`)).rejects.toThrow();
    await expect(
      db.query(
        `insert into article_localizations (article_id, locale, title, summary)
         select id, 'de', 't', 's' from articles limit 1`,
      ),
    ).rejects.toThrow();
  });
});

describe('GET /api/v1/public/articles', () => {
  it('lists contract-valid demo articles with cache headers, urgent first', async () => {
    const res = await request(app).get('/api/v1/public/articles');
    expect(res.status).toBe(200);
    const body = ArticleListResponseSchema.parse(res.body);
    expect(body.total).toBeGreaterThanOrEqual(ARTICLE_TOPICS.length);
    expect(body.items[0]?.slug).toBe(URGENT_ARTICLE_SLUG);
    expect(body.items[0]?.isUrgent).toBe(true);
    for (const item of body.items.filter((i) => i.contentOrigin === 'demo')) {
      expect(item).toMatchObject({ reviewState: 'draft', reviewerName: null, reviewedAt: null });
    }
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('filters by topic and locale', async () => {
    const res = await request(app).get('/api/v1/public/articles?topic=privacy&locale=fil');
    const body = ArticleListResponseSchema.parse(res.body);
    expect(body.items.map((i) => i.slug)).toEqual(['confidentiality-and-privacy-overview']);
    expect(body.items[0]?.locale).toBe('fil');
    expect(body.items[0]?.title).toMatch(/kumpidensyal/i);
  });

  it('searches title and summary, case-insensitively', async () => {
    const res = await request(app).get('/api/v1/public/articles?q=PREVENTION');
    expect(ArticleListResponseSchema.parse(res.body).items.map((i) => i.slug)).toContain('prevention-overview');
  });

  it('treats LIKE wildcards in the search term literally', async () => {
    for (const q of ['%', '_', '%%', 'a_b', '\\']) {
      const res = await request(app).get('/api/v1/public/articles').query({ q });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    }
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });

  it('is injection-safe: SQL-looking input is just text and tables survive', async () => {
    const res = await request(app).get('/api/v1/public/articles').query({ q: "'; drop table articles; --" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    const n = await db.query<{ n: number }>('select count(*)::int as n from articles');
    expect(n.rows[0]?.n).toBeGreaterThan(0);
  });

  it('paginates', async () => {
    const all = ArticleListResponseSchema.parse((await request(app).get('/api/v1/public/articles')).body);
    const res = await request(app).get('/api/v1/public/articles?pageSize=5&page=3');
    const body = ArticleListResponseSchema.parse(res.body);
    expect(body.items.length).toBe(all.total - 10);
    expect(body.total).toBe(all.total);
  });

  it.each(['topic=bogus', 'locale=de', 'page=0', 'pageSize=500', 'q=' + 'x'.repeat(81), 'topic=a&topic=b'])(
    'rejects invalid query %s with the 400 envelope',
    async (qs) => {
      const res = await request(app).get(`/api/v1/public/articles?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );

  it('never serves demo content when DEMO_MODE is false', async () => {
    const res = await request(prodApp).get('/api/v1/public/articles');
    expect(res.status).toBe(200);
    expect(ArticleListResponseSchema.parse(res.body).items.every((i) => i.contentOrigin === 'editorial')).toBe(true);
    const detail = await request(prodApp).get('/api/v1/public/articles/prevention-overview');
    expect(detail.status).toBe(404);
  });

  it('serves published editorial rows with reviewer, never draft or in_review editorial rows', async () => {
    await insertEditorial('fixture-published', 'published', 'A. Reviewer (fixture)', '2026-02-03');
    await insertEditorial('fixture-draft', 'draft', null, null);
    await insertEditorial('fixture-in-review', 'in_review', null, null);
    await insertEditorial('fixture-reviewed-unpublished', 'medically_reviewed', 'B. Reviewer (fixture)', '2026-02-03');
    for (const a of [app, prodApp]) {
      const res = await request(a).get('/api/v1/public/articles').query({ q: 'Fixture' });
      const slugs = ArticleListResponseSchema.parse(res.body).items.map((i) => i.slug);
      expect(slugs).toEqual(['fixture-published']);
    }
    const detail = await request(prodApp).get('/api/v1/public/articles/fixture-published');
    expect(ArticleDetailSchema.parse(detail.body)).toMatchObject({
      reviewState: 'published',
      contentOrigin: 'editorial',
      reviewerName: 'A. Reviewer (fixture)',
      reviewedAt: '2026-02-03',
    });
    expect((await request(prodApp).get('/api/v1/public/articles/fixture-draft')).status).toBe(404);
  });

  it('does not inherit approval across locales (fil missing means not served)', async () => {
    await insertEditorial('fixture-en-only', 'published', 'A. Reviewer (fixture)', '2026-02-03');
    const res = await request(prodApp).get('/api/v1/public/articles/fixture-en-only?locale=fil');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/public/articles/:slug', () => {
  it('returns the urgent article as a contract-valid detail without treatment advice or contacts', async () => {
    const res = await request(app).get(`/api/v1/public/articles/${URGENT_ARTICLE_SLUG}`);
    expect(res.status).toBe(200);
    const body = ArticleDetailSchema.parse(res.body);
    expect(body).toMatchObject({ isUrgent: true, topic: 'urgent-exposure', contentOrigin: 'demo', reviewState: 'draft' });
    const text = JSON.stringify(body.sections).toLowerCase();
    expect(text).toContain('professional');
    expect(text).not.toMatch(/\d{4,}/); // no phone numbers
    expect(text).not.toMatch(/@|https?:/); // no contacts or links
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('serves the Filipino localization on request', async () => {
    const res = await request(app).get(`/api/v1/public/articles/${URGENT_ARTICLE_SLUG}?locale=fil`);
    expect(ArticleDetailSchema.parse(res.body).locale).toBe('fil');
  });

  it('returns the 404 envelope for unknown or malformed slugs', async () => {
    for (const slug of ['does-not-exist', 'Bad_Slug', '%27%20or%201%3D1']) {
      const res = await request(app).get(`/api/v1/public/articles/${slug}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('answers 503 (no leak) when no database is configured', async () => {
    const bare = createApp({ env: demoEnv, logger: silentLogger });
    const res = await request(bare).get('/api/v1/public/articles');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('service_unavailable');
  });
});
