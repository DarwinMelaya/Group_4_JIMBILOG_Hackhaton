import type { ArticleContentOrigin, ArticleReviewState } from '@kalinga/shared';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n/format';

interface Props {
  reviewState: ArticleReviewState;
  contentOrigin: ArticleContentOrigin;
  reviewerName: string | null;
  reviewedAt: string | null;
}

/**
 * Per-locale reviewed-state label. Demo content always shows the "DEMO – not medically reviewed" label.
 * A reviewed/published label appears only when the API supplies a named reviewer and review date; anything
 * claiming review without them degrades to the unreviewed draft label (fail closed).
 */
export function ReviewBadge({ reviewState, contentOrigin, reviewerName, reviewedAt }: Props) {
  const { t, locale } = useI18n();
  const isDemo = contentOrigin === 'demo';
  const claimsReview = reviewState === 'medically_reviewed' || reviewState === 'published';
  const verified = !isDemo && claimsReview && reviewerName !== null && reviewedAt !== null;
  const state: ArticleReviewState = claimsReview && !verified ? 'draft' : reviewState;
  return (
    <p className="review-badge" data-review={isDemo ? 'demo' : state}>
      <strong className={isDemo ? 'review-badge__demo' : undefined}>
        {isDemo ? t('learn.label.demo') : t(`learn.review.${state}`)}
      </strong>
      {verified && (
        <span className="review-badge__by">
          {' '}
          {t('learn.review.by')} {reviewerName} {t('learn.review.on')} {formatDate(locale, reviewedAt)}
        </span>
      )}
    </p>
  );
}
