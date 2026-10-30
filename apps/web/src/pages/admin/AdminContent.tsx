import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminArticle, ArticleReviewState } from '@kalinga/shared';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { AdminFrame, ROLES_CONTENT, useAdminMe, useErrorText, useLabel } from '../../admin/AdminFrame';
import { listAdminArticles, transitionArticle } from '../../api/admin';

type Loc = AdminArticle['localizations'][number];

function todayManila(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
}

interface RowProps {
  article: AdminArticle;
  loc: Loc;
  busy: boolean;
  onMove: (slug: string, locale: string, body: { to: ArticleReviewState; expectedVersion: number; reviewerName?: string; reviewedOn?: string }) => Promise<boolean>;
}

/** One locale of one article. Locales never inherit each other's state, so each has its own form. */
function LocaleRow({ article, loc, busy, onMove }: RowProps) {
  const { t } = useI18n();
  const label = useLabel();
  const isDemo = article.contentOrigin === 'demo';
  // DEMO content may never be medically reviewed or published (the API refuses it as well).
  const moves = loc.allowedTransitions.filter((m) => !(isDemo && (m === 'medically_reviewed' || m === 'published')));
  const [to, setTo] = useState<ArticleReviewState | ''>('');
  const [reviewer, setReviewer] = useState('');
  const [reviewedOn, setReviewedOn] = useState('');
  const id = `${article.slug}-${loc.locale}`;
  const chosen = to && moves.includes(to) ? to : (moves[0] ?? '');
  const needsReview = chosen === 'medically_reviewed';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    const body = needsReview
      ? { to: chosen, expectedVersion: loc.version, reviewerName: reviewer.trim(), reviewedOn }
      : { to: chosen, expectedVersion: loc.version };
    if (await onMove(article.slug, loc.locale, body)) {
      setReviewer('');
      setReviewedOn('');
      setTo('');
    }
  };

  return (
    <li className="card" data-testid={`loc-${id}`}>
      <h3>
        {loc.locale.toUpperCase()}: {loc.title}
      </h3>
      <p>
        {t('admin.content.state')}: <strong>{label('enum', loc.reviewState)}</strong>
        {loc.reviewerName ? ` (${t('admin.content.by')} ${loc.reviewerName}${loc.medicallyReviewedAt ? `, ${loc.medicallyReviewedAt}` : ''})` : ''}
      </p>
      {moves.length === 0 ? (
        <p className="field-hint">{isDemo ? t('admin.content.demoLocked') : t('admin.content.noMoves')}</p>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="booking__form" aria-label={`${t('admin.content.transition')} ${loc.locale}`}>
          <div className="field">
            <label className="field-label" htmlFor={`${id}-to`}>
              {t('admin.content.transition')}
            </label>
            <select id={`${id}-to`} className="input" value={chosen} onChange={(e) => setTo(e.target.value as ArticleReviewState)}>
              {moves.map((m) => (
                <option key={m} value={m}>
                  {label('enum', m)}
                </option>
              ))}
            </select>
          </div>
          {needsReview && (
            <>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-who`}>
                  {t('admin.content.reviewer')}
                </label>
                <input id={`${id}-who`} className="input" value={reviewer} onChange={(e) => setReviewer(e.target.value)} autoComplete="off" maxLength={120} aria-describedby={`${id}-who-h`} />
                <p id={`${id}-who-h`} className="field-hint">
                  {t('admin.content.reviewerHint')}
                </p>
              </div>
              <div className="field">
                <label className="field-label" htmlFor={`${id}-on`}>
                  {t('admin.content.reviewedOn')}
                </label>
                <input id={`${id}-on`} type="date" className="input" value={reviewedOn} max={todayManila()} onChange={(e) => setReviewedOn(e.target.value)} />
              </div>
            </>
          )}
          <button type="submit" className="btn" disabled={busy}>
            {t('admin.content.apply')}
          </button>
        </form>
      )}
    </li>
  );
}

function ContentBody() {
  const { t } = useI18n();
  const errorText = useErrorText();
  const me = useAdminMe();
  const csrf = me?.csrfToken;
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [error, setError] = useState<MessageId | null>(null);
  const [notice, setNotice] = useState<MessageId | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!csrf) return;
    try {
      setArticles(await listAdminArticles(undefined, csrf));
    } catch (err) {
      setError(errorText(err));
    }
  }, [csrf, errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const onMove: RowProps['onMove'] = async (slug, locale, body) => {
    if (!csrf) return false;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await transitionArticle(slug, locale, body, csrf);
      setNotice('admin.content.moved');
      await load();
      return true;
    } catch (err) {
      setError(errorText(err));
      await load();
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}
      {articles.length === 0 && <p>{t('admin.empty')}</p>}
      {articles.map((a) => (
        <section key={a.id} className="card" aria-labelledby={`art-${a.slug}`}>
          <h2 id={`art-${a.slug}`}>
            {a.slug} ({a.contentOrigin === 'demo' ? t('admin.enum.demo') : t('admin.enum.editorial')})
          </h2>
          <ul className="staff-list">
            {a.localizations.map((l) => (
              <LocaleRow key={l.locale} article={a} loc={l} busy={busy} onMove={onMove} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function AdminContent() {
  return (
    <AdminFrame title="admin.content.title" roles={ROLES_CONTENT}>
      <ContentBody />
    </AdminFrame>
  );
}
