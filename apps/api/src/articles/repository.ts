import type { PGlite } from '@electric-sql/pglite';
import {
  ArticleDetailSchema,
  ArticleSummarySchema,
  type ArticleDetail,
  type ArticleListQuery,
  type ArticleListResponse,
  type ArticleSummary,
  type Locale,
} from '@kalinga/shared';

/** Escape LIKE/ILIKE metacharacters so user text is matched literally (used with ESCAPE '\'). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Publish-safety predicate shared by every public read. Parameters: $1 = locale, $2 = demo mode.
 * - Editorial content is served only when its localization is `published` AND names a human reviewer and review
 *   date (belt and braces: the table CHECK constraint enforces the same rule).
 * - Demo (fictitious placeholder) content is served ONLY in demo mode and never counts as reviewed.
 */
const SERVABLE = `
  l.locale = $1
  and (
    (a.content_origin = 'editorial'
      and l.review_state = 'published'
      and l.reviewer_name is not null
      and l.medically_reviewed_at is not null)
    or ($2::boolean and a.content_origin = 'demo')
  )`;

const SUMMARY_COLUMNS = `
  a.slug, a.topic, l.locale, l.title, l.summary, a.is_urgent as "isUrgent",
  l.review_state as "reviewState", a.content_origin as "contentOrigin",
  l.reviewer_name as "reviewerName", l.medically_reviewed_at::text as "reviewedAt"`;

export async function listArticles(db: PGlite, demoMode: boolean, query: ArticleListQuery): Promise<ArticleListResponse> {
  const params: unknown[] = [query.locale, demoMode];
  let where = SERVABLE;
  if (query.topic) {
    params.push(query.topic);
    where += ` and a.topic = $${params.length}`;
  }
  if (query.q) {
    params.push(`%${escapeLike(query.q)}%`);
    const n = params.length;
    where += ` and (l.title ilike $${n} escape '\\' or l.summary ilike $${n} escape '\\')`;
  }
  const from = `from articles a join article_localizations l on l.article_id = a.id where ${where}`;
  const total = await db.query<{ n: number }>(`select count(*)::int as n ${from}`, params);
  // Urgent path first, then alphabetical by title: stable and deterministic.
  const rows = await db.query<ArticleSummary>(
    `select ${SUMMARY_COLUMNS} ${from} order by a.is_urgent desc, l.title asc, a.slug asc
     limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.rows.map((r) => ArticleSummarySchema.parse(r)),
    page: query.page,
    pageSize: query.pageSize,
    total: total.rows[0]?.n ?? 0,
    locale: query.locale,
  };
}

export async function getArticle(db: PGlite, demoMode: boolean, slug: string, locale: Locale): Promise<ArticleDetail | null> {
  const res = await db.query<Record<string, unknown>>(
    `select ${SUMMARY_COLUMNS}, l.sections, l."references", l.version
     from articles a join article_localizations l on l.article_id = a.id
     where a.slug = $3 and ${SERVABLE}`,
    [locale, demoMode, slug],
  );
  const row = res.rows[0];
  return row ? ArticleDetailSchema.parse(row) : null;
}
