import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useArticle } from '../api/articles';
import { ApiRequestError } from '../api/client';
import { ReviewBadge } from '../components/ReviewBadge';
import { useI18n } from '../i18n/I18nProvider';

export function Article() {
  const { slug = '' } = useParams();
  const { t, locale } = useI18n();
  const { data, isPending, error } = useArticle(slug, locale);

  const back = (
    <Link to="/learn" className="back-link">
      <ArrowLeft size={18} aria-hidden="true" /> {t('learn.article.back')}
    </Link>
  );

  if (isPending) {
    return (
      <div className="article">
        {back}
        <h1>{t('learn.title')}</h1>
        <p role="status">{t('learn.article.loading')}</p>
      </div>
    );
  }
  if (error || !data) {
    const notFound = error instanceof ApiRequestError && error.kind === 'http' && error.status === 404;
    return (
      <div className="article">
        {back}
        <h1>{notFound ? t('learn.article.notFound.title') : t('learn.title')}</h1>
        <p role="alert">{notFound ? t('learn.article.notFound.body') : t('learn.article.error')}</p>
      </div>
    );
  }

  return (
    <article className="article" data-urgent={data.isUrgent ? 'true' : undefined}>
      {back}
      <h1>{data.title}</h1>
      <ReviewBadge
        reviewState={data.reviewState}
        contentOrigin={data.contentOrigin}
        reviewerName={data.reviewerName}
        reviewedAt={data.reviewedAt}
      />
      <p className="field-hint">{t('learn.review.localeNote')}</p>
      <p className="article__summary">{data.summary}</p>
      {data.sections.map((s, i) => (
        <section key={i} aria-labelledby={`sec-${i}`}>
          <h2 id={`sec-${i}`}>{s.heading}</h2>
          <p>{s.text}</p>
        </section>
      ))}
      <section aria-labelledby="refs-title">
        <h2 id="refs-title">{t('learn.article.references')}</h2>
        {data.references.length === 0 ? (
          <p>{t('learn.article.noReferences')}</p>
        ) : (
          <ul>
            {data.references.map((r, i) => (
              <li key={i}>
                {r.label}
                {r.note ? ` (${r.note})` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="next-title">
        <h2 id="next-title">{t('learn.article.nextStep.title')}</h2>
        <p>{t('learn.article.nextStep.body')}</p>
        <Link to="/clinics" className="btn btn--primary">{t('learn.article.nextStep.cta')}</Link>
      </section>
    </article>
  );
}
