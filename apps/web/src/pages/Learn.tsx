import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ARTICLE_TOPICS, type ArticleTopic } from '@kalinga/shared';
import { useArticles } from '../api/articles';
import { ReviewBadge } from '../components/ReviewBadge';
import { UrgentPepBanner } from '../components/UrgentPepBanner';
import { useI18n } from '../i18n/I18nProvider';
import { formatNumber } from '../i18n/format';

const SEARCH_DEBOUNCE_MS = 250;

export function Learn() {
  const { t, locale } = useI18n();
  const searchId = useId();
  const hintId = useId();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState<ArticleTopic | undefined>(undefined);

  useEffect(() => {
    const id = window.setTimeout(() => setQ(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [input]);

  const { data, isPending, isError, refetch } = useArticles({ locale, topic, q: q || undefined });
  const filtered = topic !== undefined || q !== '';

  return (
    <div className="learn">
      <h1>{t('learn.title')}</h1>
      <p className="learn__intro">{t('learn.intro')}</p>

      <UrgentPepBanner />

      <div className="learn__search">
        <label htmlFor={searchId} className="field-label">{t('learn.search.label')}</label>
        <input
          id={searchId}
          type="search"
          className="input"
          value={input}
          maxLength={80}
          autoComplete="off"
          aria-describedby={hintId}
          onChange={(e) => setInput(e.target.value)}
        />
        <p id={hintId} className="field-hint">{t('learn.search.hint')}</p>
      </div>

      <section aria-labelledby="learn-topics-title">
        <h2 id="learn-topics-title">{t('learn.topics.title')}</h2>
        <ul className="topic-grid">
          <li>
            <button type="button" className="topic-card" aria-pressed={topic === undefined} onClick={() => setTopic(undefined)}>
              {t('learn.topics.all')}
            </button>
          </li>
          {ARTICLE_TOPICS.map((tp) => (
            <li key={tp}>
              <button type="button" className="topic-card" aria-pressed={topic === tp} onClick={() => setTopic(tp)}>
                {t(`learn.topic.${tp}`)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="learn-results-title" aria-busy={isPending}>
        <h2 id="learn-results-title">{t('learn.results.title')}</h2>
        <div role="status" aria-live="polite" className="learn__status">
          {isPending && <p>{t('learn.state.loading')}</p>}
          {data && data.total > 0 && (
            <p>
              {formatNumber(locale, data.total)} {t('learn.results.count')}
            </p>
          )}
        </div>
        {isError && (
          <div className="state-box" role="alert">
            <p>{t('learn.state.error')}</p>
            <button type="button" className="btn btn--secondary" onClick={() => void refetch()}>
              {t('learn.state.retry')}
            </button>
          </div>
        )}
        {data && data.items.length === 0 && (
          <div className="state-box" data-testid="learn-empty">
            <p>{t('learn.state.empty')}</p>
            <p className="field-hint">{t('learn.state.emptyHint')}</p>
            {filtered && (
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setInput('');
                  setQ('');
                  setTopic(undefined);
                }}
              >
                {t('learn.state.clear')}
              </button>
            )}
          </div>
        )}
        {data && data.items.length > 0 && (
          <ul className="article-list">
            {data.items.map((a) => (
              <li key={a.slug} className="article-card" data-urgent={a.isUrgent ? 'true' : undefined}>
                <h3>
                  <Link to={`/learn/${a.slug}`}>{a.title}</Link>
                </h3>
                <ReviewBadge
                  reviewState={a.reviewState}
                  contentOrigin={a.contentOrigin}
                  reviewerName={a.reviewerName}
                  reviewedAt={a.reviewedAt}
                />
                <p>{a.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        <Link to="/care" className="btn btn--secondary">
          {t('care.nav.link')}
        </Link>
      </p>
    </div>
  );
}
