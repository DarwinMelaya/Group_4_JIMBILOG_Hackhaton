import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ARTICLE_TOPICS, URGENT_ARTICLE_SLUG, type ArticleDetail, type ArticleSummary, type Locale } from '@kalinga/shared';
import { AppRoutes } from '../App';
import { I18nProvider } from '../i18n/I18nProvider';
import { fil } from '../i18n/catalog';
import { queryClient } from '../api/client';
import { formatViolations, runAxe } from '../a11y/axe';

const CONFIG = {
  apiVersion: 'v1',
  demoMode: true,
  locales: ['en', 'fil'],
  defaultLocale: 'en',
  timezone: 'Asia/Manila',
  notificationTransport: 'mock',
  realBookingEnabled: false,
  clinicalContentApproved: false,
};

function summary(over: Partial<ArticleSummary> = {}): ArticleSummary {
  return {
    slug: 'prevention-overview',
    topic: 'prevention',
    locale: 'en',
    title: 'Prevention: an overview',
    summary: 'DEMO placeholder summary.',
    isUrgent: false,
    reviewState: 'draft',
    contentOrigin: 'demo',
    reviewerName: null,
    reviewedAt: null,
    ...over,
  };
}
const URGENT = summary({
  slug: URGENT_ARTICLE_SLUG,
  topic: 'urgent-exposure',
  title: 'Possible recent HIV exposure (within 72 hours): get a professional assessment urgently',
  isUrgent: true,
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

type Handler = (url: URL) => Response | Promise<Response>;
function stubApi(articles: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, ...rest: [RequestInit?]) => {
    void rest;
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/v1/public/config') return json(CONFIG);
    return articles(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const listOf = (items: ArticleSummary[], locale: Locale = 'en') =>
  json({ items, page: 1, pageSize: 20, total: items.length, locale });

function renderApp(path: string, locale: Locale = 'en') {
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => queryClient.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Learn page', () => {
  it('shows the urgent banner, topic cards, and DEMO-labelled articles', async () => {
    stubApi(() => listOf([URGENT, summary()]));
    renderApp('/learn');
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    const banner = screen.getByRole('region', { name: 'Possible HIV exposure in the last 72 hours?' });
    expect(within(banner).getByRole('link', { name: 'Urgent: read what to do first' })).toHaveAttribute(
      'href',
      `/learn/${URGENT_ARTICLE_SLUG}`,
    );
    const topics = screen.getByRole('region', { name: 'Browse by topic' });
    expect(within(topics).getAllByRole('button')).toHaveLength(ARTICLE_TOPICS.length + 1);
    expect(await screen.findByRole('link', { name: 'Prevention: an overview' })).toHaveAttribute('href', '/learn/prevention-overview');
    expect(screen.getAllByText('DEMO – not medically reviewed').length).toBe(2);
    expect(screen.queryByText(/medically reviewed and published/i)).not.toBeInTheDocument();
  });

  it('shows a loading state, then results count', async () => {
    stubApi(() => new Promise<Response>(() => undefined));
    renderApp('/learn');
    expect(await screen.findByText('Loading articles...')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    let fail = true;
    const fetchMock = stubApi(() => (fail ? json({ error: { code: 'x', message: 'x', requestId: 'r' } }, 500) : listOf([summary()])));
    renderApp('/learn');
    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent('Articles could not be loaded right now');
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Prevention: an overview' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows an empty state and clears filters', async () => {
    stubApi((url) => (url.searchParams.get('q') ? listOf([]) : listOf([summary()])));
    renderApp('/learn');
    await screen.findByRole('link', { name: 'Prevention: an overview' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search articles' }), 'zzz');
    const empty = await screen.findByTestId('learn-empty');
    expect(empty).toHaveTextContent('No articles match your search.');
    await userEvent.click(within(empty).getByRole('button', { name: 'Clear search and topic' }));
    expect(await screen.findByRole('link', { name: 'Prevention: an overview' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('sends topic, search and locale to the API (no user data besides the filters)', async () => {
    const fetchMock = stubApi(() => listOf([summary()]));
    renderApp('/learn', 'fil');
    await screen.findByRole('link', { name: 'Prevention: an overview' });
    await userEvent.click(screen.getByRole('button', { name: fil['learn.topic.prevention'].text }));
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('topic=prevention') && u.includes('locale=fil'))).toBe(true);
    });
    expect(fetchMock.mock.calls.every((c) => (c[1] as RequestInit | undefined)?.credentials !== 'include')).toBe(true);
  });

  it('marks the pressed topic card with aria-pressed', async () => {
    stubApi(() => listOf([summary()]));
    renderApp('/learn');
    const btn = screen.getByRole('button', { name: 'Prevention' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('only labels an article reviewed when a reviewer and date are present (fail closed)', async () => {
    stubApi(() =>
      listOf([
        summary({ slug: 'a', title: 'Reviewed A', contentOrigin: 'editorial', reviewState: 'published', reviewerName: 'Dr Fixture', reviewedAt: '2026-02-03' }),
        summary({ slug: 'b', title: 'Bogus B', contentOrigin: 'editorial', reviewState: 'published', reviewerName: null, reviewedAt: null }),
      ]),
    );
    renderApp('/learn');
    await screen.findByRole('link', { name: 'Reviewed A' });
    expect(screen.getAllByText('Medically reviewed and published')).toHaveLength(1);
    expect(screen.getByText(/Reviewed by Dr Fixture on/)).toBeInTheDocument();
    expect(screen.getByText('Draft: not medically reviewed')).toBeInTheDocument();
  });

  it('uses Filipino strings and Filipino review label in fil', async () => {
    stubApi(() => listOf([summary({ locale: 'fil', title: 'Pag-iwas' })], 'fil'));
    renderApp('/learn', 'fil');
    expect(screen.getByRole('heading', { level: 1, name: fil['learn.title'].text })).toBeInTheDocument();
    expect(await screen.findByText(fil['learn.label.demo'].text)).toBeInTheDocument();
  });

  it('has no axe violations when loaded', async () => {
    stubApi(() => listOf([URGENT, summary()]));
    const { container } = renderApp('/learn');
    await screen.findByRole('link', { name: 'Prevention: an overview' });
    expect(formatViolations(await runAxe(container))).toBe('');
  });
});

describe('Article page', () => {
  const detail: ArticleDetail = {
    ...URGENT,
    sections: [
      { heading: 'Do not wait', text: 'Please speak to a qualified health professional.' },
      { heading: 'Reviewed guidance', text: 'Placeholder.' },
    ],
    references: [],
    version: 1,
  };

  it('renders the urgent article with DEMO label, sections, no-references note and next step', async () => {
    const fetchMock = stubApi(() => json(detail));
    const { container } = renderApp(`/learn/${URGENT_ARTICLE_SLUG}`);
    expect(await screen.findByRole('heading', { level: 1, name: URGENT.title })).toBeInTheDocument();
    expect(screen.getByText('DEMO – not medically reviewed')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Do not wait' })).toBeInTheDocument();
    expect(screen.getByText(/No references yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore Testing Options' })).toHaveAttribute('href', '/clinics');
    expect(screen.getByRole('link', { name: 'Back to all articles' })).toHaveAttribute('href', '/learn');
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContainEqual(expect.stringContaining(`/public/articles/${URGENT_ARTICLE_SLUG}?locale=en`));
    expect(formatViolations(await runAxe(container))).toBe('');
  });

  it('shows a not-available message on 404 (e.g. not reviewed in this language)', async () => {
    stubApi(() => json({ error: { code: 'not_found', message: 'Not found.', requestId: 'r' } }, 404));
    renderApp('/learn/nope', 'fil');
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(fil['learn.article.notFound.body'].text);
  });

  it('shows a generic error on server failure', async () => {
    stubApi(() => json({}, 500));
    renderApp('/learn/anything');
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('could not be loaded');
  });
});

describe('Home urgent path', () => {
  it('links the urgent card on Home to the urgent article', async () => {
    stubApi(() => listOf([]));
    renderApp('/');
    expect(screen.getByRole('link', { name: 'Urgent: read what to do first' })).toHaveAttribute(
      'href',
      `/learn/${URGENT_ARTICLE_SLUG}`,
    );
  });
});
