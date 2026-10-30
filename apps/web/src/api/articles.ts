import { useQuery } from '@tanstack/react-query';
import {
  ArticleDetailSchema,
  ArticleListResponseSchema,
  type ArticleDetail,
  type ArticleListResponse,
  type ArticleTopic,
  type Locale,
} from '@kalinga/shared';
import { apiGet, queryClient } from './client';

export interface ArticleFilters {
  locale: Locale;
  topic?: ArticleTopic;
  q?: string;
}

export function articlesQuery(f: ArticleFilters) {
  const params = new URLSearchParams({ locale: f.locale });
  if (f.topic) params.set('topic', f.topic);
  if (f.q) params.set('q', f.q);
  return {
    queryKey: ['articles', f.locale, f.topic ?? null, f.q ?? null] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<ArticleListResponse> =>
      apiGet(`/public/articles?${params.toString()}`, ArticleListResponseSchema, signal),
  };
}

export function articleQuery(slug: string, locale: Locale) {
  return {
    queryKey: ['article', slug, locale] as const,
    queryFn: ({ signal }: { signal: AbortSignal }): Promise<ArticleDetail> =>
      apiGet(`/public/articles/${encodeURIComponent(slug)}?locale=${locale}`, ArticleDetailSchema, signal),
  };
}

export function useArticles(filters: ArticleFilters) {
  return useQuery(articlesQuery(filters), queryClient);
}

export function useArticle(slug: string, locale: Locale) {
  return useQuery(articleQuery(slug, locale), queryClient);
}
