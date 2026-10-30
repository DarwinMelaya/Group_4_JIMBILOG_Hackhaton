import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { ADMIN_ROLES, AdminFrame, useAdminMe, useErrorText } from '../../admin/AdminFrame';
import { getReportCsv, getReportSummary, type ReportSummary } from '../../api/reports';

const MONTH_CHOICES = [3, 6, 12] as const;
type MonthChoice = (typeof MONTH_CHOICES)[number];
const COLUMNS = ['received', 'awaiting', 'confirmed', 'alternative', 'cancelled', 'expired'] as const;

/** Hands the CSV text to the browser as a file download. Nothing is stored; the object URL is revoked straight away. */
function saveCsv(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kalinga-demo-report.csv';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ReportsBody() {
  const { t } = useI18n();
  const me = useAdminMe();
  const errorText = useErrorText();
  const monthsId = useId();
  const [months, setMonths] = useState<MonthChoice>(6);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<MessageId | null>(null);
  const [notice, setNotice] = useState(false);
  const role = me?.user.role;
  // Sequence guard: only the newest request may update state, so a slow earlier response (other month range) is ignored.
  const seq = useRef(0);
  useEffect(() => () => void (seq.current += 1), []);

  const load = useCallback(async () => {
    if (!role) return;
    const mine = ++seq.current;
    try {
      const data = await getReportSummary(months);
      if (mine !== seq.current) return;
      setSummary(data);
      setError(null);
    } catch (err) {
      if (mine !== seq.current) return;
      setError(errorText(err));
    }
  }, [role, months, errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = async () => {
    setNotice(false);
    try {
      saveCsv(await getReportCsv(months));
      setNotice(true);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <>
      <p>{t('reports.intro')}</p>
      <p className="field-hint">{t('reports.demo')}</p>
      <p className="field-hint">{t('reports.privacy')}</p>
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}
      <div className="field">
        <label htmlFor={monthsId}>{t('reports.months.label')}</label>
        <select id={monthsId} className="input" value={months} onChange={(e) => setMonths(Number(e.target.value) as MonthChoice)}>
          {MONTH_CHOICES.map((m) => (
            <option key={m} value={m}>
              {t(`reports.months.${m}`)}
            </option>
          ))}
        </select>
      </div>
      {!summary && !error && <p role="status">{t('reports.loading')}</p>}
      {summary && (
        <section className="card" aria-labelledby="report-scope">
          <h2 id="report-scope">{t(summary.scope === 'all' ? 'reports.scope.all' : 'reports.scope.clinic')}</h2>
          <div className="report-scroll" role="region" aria-label={t('reports.table.caption')} tabIndex={0}>
            <table className="report-table">
              <caption className="sr-only">{t('reports.table.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('reports.col.period')}</th>
                  {COLUMNS.map((c) => (
                    <th key={c} scope="col">
                      {t(`reports.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.periods.map((p) => (
                  <tr key={p.period}>
                    <th scope="row">{p.period}</th>
                    {COLUMNS.map((c) => (
                      <td key={c}>{p[c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.attendance && <p className="field-hint">{t('reports.attendance')}</p>}
          <p className="field-hint">{t('reports.export.help')}</p>
          <p>
            <button type="button" className="btn" onClick={() => void onExport()}>
              {t('reports.export')}
            </button>
          </p>
          {notice && <p role="status">{t('reports.export.done')}</p>}
        </section>
      )}
    </>
  );
}

export function AdminReports() {
  return (
    <AdminFrame title="reports.title" roles={ADMIN_ROLES}>
      <ReportsBody />
    </AdminFrame>
  );
}
