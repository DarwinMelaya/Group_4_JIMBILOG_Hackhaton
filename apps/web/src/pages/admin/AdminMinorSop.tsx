import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminClinic, MinorBookingReadiness, MinorSopMapping } from '@kalinga/shared';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { AdminFrame, ROLES_MINOR, ROLES_WRITE, useAdminMe, useErrorText, useLabel } from '../../admin/AdminFrame';
import { listAdminClinics, listMinorMappings, minorReadiness, recordMinorMapping, revokeMinorMapping } from '../../api/admin';

function MinorBody() {
  const { t } = useI18n();
  const label = useLabel();
  const errorText = useErrorText();
  const me = useAdminMe();
  const csrf = me?.csrfToken;
  const canWrite = me !== null && ROLES_WRITE.includes(me.user.role);

  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [clinicId, setClinicId] = useState('');
  const [readiness, setReadiness] = useState<MinorBookingReadiness | null>(null);
  const [mappings, setMappings] = useState<MinorSopMapping[]>([]);
  const [error, setError] = useState<MessageId | null>(null);
  const [sopRef, setSopRef] = useState('');
  const [sopVersion, setSopVersion] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [approvedAt, setApprovedAt] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');

  const selected = clinics.find((c) => c.id === clinicId) ?? null;

  const load = useCallback(async () => {
    if (!csrf) return;
    try {
      const [cl, r] = await Promise.all([listAdminClinics(undefined, csrf), minorReadiness(clinicId || undefined, undefined, csrf)]);
      setClinics(cl);
      setReadiness(r);
      setMappings(clinicId ? await listMinorMappings(clinicId, undefined, csrf) : []);
    } catch (err) {
      setError(errorText(err));
    }
  }, [csrf, clinicId, errorText]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (job: () => Promise<unknown>) => {
    setError(null);
    try {
      await job();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const onRecord = (e: FormEvent) => {
    e.preventDefault();
    if (!csrf || !clinicId) return;
    void run(async () => {
      await recordMinorMapping(clinicId, { sopArtifactReference: sopRef.trim(), sopVersion: sopVersion.trim(), approvedBy: approvedBy.trim(), approvedAt, effectiveFrom }, csrf);
      setSopRef('');
      setSopVersion('');
      setApprovedBy('');
      setApprovedAt('');
      setEffectiveFrom('');
    });
  };

  return (
    <>
      {!canWrite && <p className="field-hint">{t('admin.readOnly')}</p>}
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}

      <section className="card" aria-labelledby="minor-ready-h">
        <h2 id="minor-ready-h">{t('admin.minor.readiness')}</h2>
        {/* Shown regardless of the API answer: the flags are literal false in this prototype and a mapping never flips them. */}
        <p data-testid="minor-not-active">
          <strong>{t('admin.minor.notActive')}</strong>
        </p>
        <p data-testid="minor-mapping-only">{t('admin.minor.mappingOnly')}</p>
        {readiness && (
          <ul>
            <li>
              {t('admin.minor.mappingPresent')}: {readiness.mappingPresent ? t('admin.minor.yes') : t('admin.minor.no')} ({readiness.mappingCount})
            </li>
            <li>
              {t('admin.config.realMinor')}: {t('admin.config.off')}
            </li>
            {readiness.blockedBy.length > 0 && (
              <li>
                {t('admin.minor.blockedBy')}: {readiness.blockedBy.join(', ')}
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="minor-map-h">
        <h2 id="minor-map-h">{t('admin.minor.mappings')}</h2>
        <div className="field">
          <label className="field-label" htmlFor="minor-clinic">
            {t('admin.minor.pickClinic')}
          </label>
          <select id="minor-clinic" className="input" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="" />
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {selected?.isDemo && <p className="demo-banner-inline">{t('admin.minor.demoLocked')}</p>}
        {clinicId && (mappings.length === 0 ? <p>{t('admin.empty')}</p> : null)}
        <ul className="staff-list">
          {mappings.map((m) => (
            <li key={m.id}>
              {m.sopArtifactReference} ({m.sopVersion}) - {t('admin.minor.approvedBy')} {m.approvedBy}, {m.approvedAt}; {t('admin.minor.effectiveFrom')} {m.effectiveFrom} - {label('enum', m.status)}
              {canWrite && m.status === 'recorded' && (
                <button type="button" className="btn btn--secondary" onClick={() => csrf && void run(() => revokeMinorMapping(clinicId, m.id, csrf))}>
                  {t('admin.minor.revoke')} {m.sopArtifactReference}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canWrite && clinicId && selected && !selected.isDemo && (
        <form onSubmit={onRecord} noValidate className="card booking__form" aria-labelledby="minor-rec-h">
          <h2 id="minor-rec-h">{t('admin.minor.record')}</h2>
          <div className="field">
            <label className="field-label" htmlFor="sop-ref">
              {t('admin.minor.sopRef')}
            </label>
            <input id="sop-ref" className="input" value={sopRef} onChange={(e) => setSopRef(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sop-ver">
              {t('admin.minor.sopVersion')}
            </label>
            <input id="sop-ver" className="input" value={sopVersion} onChange={(e) => setSopVersion(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sop-by">
              {t('admin.minor.approvedBy')}
            </label>
            <input id="sop-by" className="input" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sop-at">
              {t('admin.minor.approvedAt')}
            </label>
            <input id="sop-at" type="date" className="input" value={approvedAt} onChange={(e) => setApprovedAt(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sop-from">
              {t('admin.minor.effectiveFrom')}
            </label>
            <input id="sop-from" type="date" className="input" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <button type="submit" className="btn">
            {t('admin.minor.record')}
          </button>
        </form>
      )}
    </>
  );
}

export function AdminMinorSop() {
  return (
    <AdminFrame title="admin.minor.title" roles={ROLES_MINOR}>
      <MinorBody />
    </AdminFrame>
  );
}
