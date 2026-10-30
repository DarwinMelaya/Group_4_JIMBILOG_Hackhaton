import { z } from 'zod';
import { LOCALES } from './locales.js';

/** Topic cards of the STI Information Hub (master prompt F02). Stable IDs; titles live in the web i18n catalogs. */
export const ARTICLE_TOPICS = [
  'basics',
  'common-stis',
  'symptoms',
  'transmission',
  'prevention',
  'testing',
  'treatment-followup',
  'privacy',
  'myths-faq',
  'clinic-expectations',
  'seek-professional',
  'urgent-exposure',
] as const;
export type ArticleTopic = (typeof ARTICLE_TOPICS)[number];

/** Per-locale editorial lifecycle. Mirrors the Postgres enum `article_review_state`. */
export const ARTICLE_REVIEW_STATES = ['draft', 'in_review', 'medically_reviewed', 'published'] as const;
export type ArticleReviewState = (typeof ARTICLE_REVIEW_STATES)[number];

/** `demo` rows are fictitious placeholders that can never be medically reviewed or published. */
export const ARTICLE_CONTENT_ORIGINS = ['editorial', 'demo'] as const;
export type ArticleContentOrigin = (typeof ARTICLE_CONTENT_ORIGINS)[number];

/** The separate urgent possible-recent-HIV-exposure path (professional assessment, no treatment advice). */
export const URGENT_ARTICLE_SLUG = 'urgent-possible-hiv-exposure-72-hours';

export const ArticleSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** Query for GET /api/v1/public/articles. Narrow allowlist; unknown params are ignored, repeated params rejected. */
export const ArticleListQuerySchema = z.object({
  topic: z.enum(ARTICLE_TOPICS).optional(),
  q: z.string().trim().max(80).optional(),
  locale: z.enum(LOCALES).default('en'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ArticleListQuery = z.infer<typeof ArticleListQuerySchema>;

export const ArticleDetailQuerySchema = z.object({ locale: z.enum(LOCALES).default('en') });

const reviewFields = {
  reviewState: z.enum(ARTICLE_REVIEW_STATES),
  contentOrigin: z.enum(ARTICLE_CONTENT_ORIGINS),
  reviewerName: z.string().nullable(),
  /** ISO date (YYYY-MM-DD) of the medical review, or null when unreviewed. */
  reviewedAt: z.string().nullable(),
};

export const ArticleSummarySchema = z
  .object({
    slug: ArticleSlugSchema,
    topic: z.enum(ARTICLE_TOPICS),
    locale: z.enum(LOCALES),
    title: z.string(),
    summary: z.string(),
    isUrgent: z.boolean(),
    ...reviewFields,
  })
  .strict();
export type ArticleSummary = z.infer<typeof ArticleSummarySchema>;

export const ArticleListResponseSchema = z
  .object({
    items: z.array(ArticleSummarySchema),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    locale: z.enum(LOCALES),
  })
  .strict();
export type ArticleListResponse = z.infer<typeof ArticleListResponseSchema>;

export const ArticleSectionSchema = z.object({ heading: z.string(), text: z.string() }).strict();
export const ArticleReferenceSchema = z.object({ label: z.string(), note: z.string().optional() }).strict();

export const ArticleDetailSchema = ArticleSummarySchema.extend({
  sections: z.array(ArticleSectionSchema),
  references: z.array(ArticleReferenceSchema),
  version: z.number().int(),
}).strict();
export type ArticleDetail = z.infer<typeof ArticleDetailSchema>;
