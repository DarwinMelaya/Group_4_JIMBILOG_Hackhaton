import type { PGlite } from '@electric-sql/pglite';
import {
  ARTICLE_REVIEW_TRANSITIONS,
  AdminArticleSchema,
  canReviewTransition,
  type AdminArticle,
  type ArticleReviewState,
  type ArticleTransition,
  type Locale,
} from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { recordGovernanceAudit } from './audit.js';
import { guarded, notFound, versionConflict } from './common.js';

interface ListRow {
  article_id: string;
  slug: string;
  topic: string;
  content_origin: 'editorial' | 'demo';
  is_urgent: boolean;
  locale: Locale | null;
  title: string | null;
  review_state: ArticleReviewState | null;
  reviewer_name: string | null;
  medically_reviewed_at: string | null;
  version: number | null;
}

/** All articles with each locale's OWN review state, reviewer and date (no locale inherits another's). */
export async function listAdminArticles(db: PGlite): Promise<AdminArticle[]> {
  const r = await db.query<ListRow>(
    `select a.id as article_id, a.slug, a.topic, a.content_origin, a.is_urgent, l.locale, l.title, l.review_state,
            l.reviewer_name, l.medically_reviewed_at::text as medically_reviewed_at, l.version
     from articles a left join article_localizations l on l.article_id = a.id
     order by a.slug, l.locale limit 500`,
  );
  const byArticle = new Map<string, AdminArticle>();
  for (const row of r.rows) {
    let art = byArticle.get(row.article_id);
    if (!art) {
      art = AdminArticleSchema.parse({
        id: row.article_id,
        slug: row.slug,
        topic: row.topic,
        contentOrigin: row.content_origin,
        isUrgent: row.is_urgent,
        localizations: [],
      });
      byArticle.set(row.article_id, art);
    }
    if (row.locale && row.review_state && row.title !== null && row.version !== null) {
      art.localizations.push({
        locale: row.locale,
        title: row.title,
        reviewState: row.review_state,
        reviewerName: row.reviewer_name,
        medicallyReviewedAt: row.medically_reviewed_at,
        version: row.version,
        allowedTransitions: [...ARTICLE_REVIEW_TRANSITIONS[row.review_state]],
      });
    }
  }
  return [...byArticle.values()];
}

/** The current calendar date in Asia/Manila (UTC+8, no DST) as YYYY-MM-DD. */
function manilaToday(now: Date): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export interface TransitionResult {
  slug: string;
  locale: Locale;
  reviewState: ArticleReviewState;
  reviewerName: string | null;
  medicallyReviewedAt: string | null;
  version: number;
}

/**
 * Moves ONE locale of ONE article. No other localization is read or written, so a review or publication never carries
 * over to the other language. DEMO-origin content can reach neither `medically_reviewed` nor `published`.
 */
export async function transitionLocalization(
  db: PGlite,
  slug: string,
  locale: Locale,
  actorId: string,
  input: ArticleTransition,
  now: Date,
): Promise<TransitionResult> {
  return guarded(() =>
    db.transaction(async (tx) => {
      const r = await tx.query<{
        id: string;
        origin: 'editorial' | 'demo';
        review_state: ArticleReviewState;
        version: number;
        refs: number;
        sections: number;
      }>(
        `select l.id, a.content_origin as origin, l.review_state, l.version,
                jsonb_array_length(l."references")::int as refs, jsonb_array_length(l.sections)::int as sections
         from articles a join article_localizations l on l.article_id = a.id
         where a.slug = $1 and l.locale = $2 for update of l`,
        [slug, locale],
      );
      const cur = r.rows[0];
      if (!cur) throw notFound();
      if (cur.version !== input.expectedVersion) throw versionConflict();
      if (cur.origin === 'demo' && (input.to === 'medically_reviewed' || input.to === 'published')) {
        throw new AppError(409, 'demo_content_locked', 'DEMO content can never be medically reviewed or published.');
      }
      if (!canReviewTransition(cur.review_state, input.to)) {
        throw new AppError(409, 'invalid_transition', 'That review step is not allowed from the current state.');
      }
      if (input.to === 'medically_reviewed') {
        if (cur.refs === 0 || cur.sections === 0) {
          throw new AppError(422, 'references_required', 'Content with sections and references is required before a medical review is recorded.');
        }
        if ((input.reviewedOn ?? '') > manilaToday(now)) {
          throw new AppError(422, 'reviewed_on_future', 'The review date cannot be in the future.');
        }
      }
      const clearReviewer = input.to === 'draft' || input.to === 'in_review';
      const upd = await tx.query<{ version: number; reviewer_name: string | null; reviewed: string | null }>(
        `update article_localizations
         set review_state = $2::article_review_state,
             reviewer_name = case when $3::boolean then null when $4::text is not null then $4::text else reviewer_name end,
             medically_reviewed_at = case when $3::boolean then null when $5::text is not null then $5::date else medically_reviewed_at end,
             version = version + 1, updated_at = $6::timestamptz
         where id = $1
         returning version, reviewer_name, medically_reviewed_at::text as reviewed`,
        [cur.id, input.to, clearReviewer, input.reviewerName ?? null, input.reviewedOn ?? null, now.toISOString()],
      );
      const row = upd.rows[0];
      if (!row) throw notFound();
      await recordGovernanceAudit(tx, {
        actorUserId: actorId,
        action: 'governance.article_review_changed',
        targetType: 'article_localization',
        targetId: cur.id,
        metadata: { locale, from_status: cur.review_state, to_status: input.to, version_before: cur.version, version_after: row.version },
        at: now,
      });
      return { slug, locale, reviewState: input.to, reviewerName: row.reviewer_name, medicallyReviewedAt: row.reviewed, version: row.version };
    }),
  );
}

