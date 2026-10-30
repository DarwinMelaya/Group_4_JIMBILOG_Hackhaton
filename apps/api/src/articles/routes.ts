import express from 'express';
import type { PGlite } from '@electric-sql/pglite';
import { ArticleDetailQuerySchema, ArticleListQuerySchema, ArticleSlugSchema } from '@kalinga/shared';
import { AppError } from '../http/errors.js';
import { getArticle, listArticles } from './repository.js';

/** Public, read-only. Content is short-lived cacheable; errors keep the no-store envelope. */
const CACHE = 'public, max-age=60';

export function articlesRouter(demoMode: boolean, getDb: () => PGlite | undefined): express.Router {
  const router = express.Router();
  const db = (): PGlite => {
    const d = getDb();
    if (!d) throw new AppError(503, 'service_unavailable', 'This service is temporarily unavailable.');
    return d;
  };

  router.get('/public/articles', async (req, res) => {
    const query = ArticleListQuerySchema.parse(req.query);
    const body = await listArticles(db(), demoMode, query);
    res.setHeader('Cache-Control', CACHE);
    res.json(body);
  });

  router.get('/public/articles/:slug', async (req, res) => {
    const slug = ArticleSlugSchema.safeParse(req.params.slug);
    if (!slug.success) throw new AppError(404, 'not_found', 'Not found.');
    const { locale } = ArticleDetailQuerySchema.parse(req.query);
    const article = await getArticle(db(), demoMode, slug.data, locale);
    if (!article) throw new AppError(404, 'not_found', 'Not found.');
    res.setHeader('Cache-Control', CACHE);
    res.json(article);
  });

  return router;
}
