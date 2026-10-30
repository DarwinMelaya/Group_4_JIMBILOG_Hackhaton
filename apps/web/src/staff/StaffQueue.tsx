import { useCallback, type ChangeEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BOOKING_STATUSES, type BookingStatus, type StaffBookingItem } from '@kalinga/shared';
import { listStaffRequests } from '../api/staff';
import { DemoLabel } from '../components/clinic-facts';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatDateTime } from '../i18n/format';
import { useStaffContext, useStaffLoad } from './StaffFrame';

const PAGE_SIZE = 20;

const isStatus = (v: string | null): v is BookingStatus => v !== null && (BOOKING_STATUSES as readonly string[]).includes(v);

/**
 * Booking-request queue for the selected clinic. Rows carry only the minimal metadata the API returns (reference,
 * status, preferred date and window, service, age band, received time): never requester notes or clinic notes.
 * Filter and page live in the URL (?status=&offset=), which holds no personal data.
 */
export function StaffQueue() {
  const { t, locale } = useI18n();
  const { clinic } = useStaffContext();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status = isStatus(statusParam) ? statusParam : undefined;
  const rawOffset = Number(params.get('offset'));
  const offset = Number.isInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const clinicId = clinic.clinicId;

  const load = useCallback(
    (signal: AbortSignal) => listStaffRequests(clinicId, { status, limit: PAGE_SIZE, offset }, signal),
    [clinicId, status, offset],
  );
  const { state, reload } = useStaffLoad(load);

  const update = (next: { status?: string; offset?: number }) => {
    const p = new URLSearchParams(params);
    if ('status' in next) {
      if (next.status) p.set('status', next.status);
      else p.delete('status');
      p.delete('offset');
    }
    if (next.offset !== undefined) {
      if (next.offset > 0) p.set('offset', String(next.offset));
      else p.delete('offset');
    }
    setParams(p);
  };

  const onFilter = (e: ChangeEvent<HTMLSelectElement>) => update({ status: e.target.value });

  return (
    <div className="booking staff-queue">
      <h1>{t('staff.queue.title')}</h1>
      <p>{t('staff.queue.intro')}</p>

      <div className="field">
        <label className="field-label" htmlFor="staff-status-filter">
          {t('staff.queue.filter')}
        </label>
        <select id="staff-status-filter" className="input" value={status ?? ''} onChange={onFilter}>
          <option value="">{t('staff.queue.filter.all')}</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`staff.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {state.kind === 'loading' && <p role="status">{t('staff.queue.loading')}</p>}
      {(state.kind === 'error' || state.kind === 'notfound') && (
        <div>
          <p role="alert" className="field-error">
            {t('staff.queue.error')}
          </p>
          <p>
            <button type="button" className="btn btn--secondary" onClick={reload}>
              {t('staff.retry')}
            </button>
          </p>
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          {state.data.items.length === 0 ? (
            <p data-testid="staff-queue-empty">{t('staff.queue.empty')}</p>
          ) : (
            <>
              <p className="field-hint" data-testid="staff-queue-count">
                {t('staff.queue.showing')} {state.data.offset + 1}-{state.data.offset + state.data.items.length} {t('staff.queue.of')} {state.data.total}
              </p>
              <ul className="staff-list" aria-label={t('staff.queue.title')}>
                {state.data.items.map((item) => (
                  <QueueRow key={item.id} item={item} clinicId={clinicId} locale={locale} />
                ))}
              </ul>
              <div className="actions">
                <button type="button" className="btn btn--secondary" disabled={state.data.offset <= 0} onClick={() => update({ offset: Math.max(0, state.data.offset - PAGE_SIZE) })}>
                  {t('staff.queue.prev')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={state.data.offset + state.data.items.length >= state.data.total}
                  onClick={() => update({ offset: state.data.offset + PAGE_SIZE })}
                >
                  {t('staff.queue.next')}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function QueueRow({ item, clinicId, locale }: { item: StaffBookingItem; clinicId: string; locale: 'en' | 'fil' }) {
  const { t } = useI18n();
  return (
    <li className="card staff-item" data-status={item.status}>
      <h2 className="staff-item__ref">
        <Link to={`/staff/requests/${encodeURIComponent(item.id)}?clinic=${encodeURIComponent(clinicId)}`}>{item.reference}</Link>
      </h2>
      <p>
        <strong className="staff-status">{t(`staff.status.${item.status}`)}</strong> <DemoLabel isDemo={item.isDemo} />
      </p>
      <dl className="fact-dl">
        <dt>{t('staff.item.preferred')}</dt>
        <dd>{formatDate(locale, item.preferredDate)}</dd>
        <dt>{t('staff.item.window')}</dt>
        <dd>{t(`booking.window.${item.preferredWindow}`)}</dd>
        <dt>{t('staff.item.service')}</dt>
        <dd>{item.service ? t(`clinics.service.${item.service}`) : t('staff.item.noService')}</dd>
        <dt>{t('staff.item.age')}</dt>
        <dd>{t(`booking.age.${item.ageBand}`)}</dd>
        <dt>{t('staff.item.received')}</dt>
        <dd>{formatDateTime(locale, item.createdAt)}</dd>
      </dl>
    </li>
  );
}
