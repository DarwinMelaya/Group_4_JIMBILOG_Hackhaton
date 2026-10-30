import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EVIDENCE_TYPES,
  SETTABLE_VERIFICATION_LEVELS,
  VERIFICATION_STATUSES,
  CLINIC_PUBLISH_STATUSES,
  type AdminClinic,
  type ClinicVerificationUpdate,
  type Evidence,
  type EvidenceType,
} from '@kalinga/shared';
import type { MessageId } from '../../i18n/catalog';
import { useI18n } from '../../i18n/I18nProvider';
import { AdminFrame, ROLES_CLINICS, ROLES_WRITE, useAdminMe, useErrorText, useLabel } from '../../admin/AdminFrame';
import { addEvidence, listAdminClinics, listEvidence, reviewEvidence, updateClinicStatus, updateClinicVerification } from '../../api/admin';

/** Evidence expiry is end of the chosen day, Asia/Manila (+08:00), sent as an instant. */
function expiryInstant(date: string): string {
  return new Date(`${date}T23:59:59+08:00`).toISOString();
}

function ClinicsBody() {
  const { t } = useI18n();
  const label = useLabel();
  const errorText = useErrorText();
  const me = useAdminMe();
  const csrf = me?.csrfToken;
  const canWrite = me !== null && ROLES_WRITE.includes(me.user.role);

  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState<MessageId | null>(null);
  const [notice, setNotice] = useState<MessageId | null>(null);

  const [evType, setEvType] = useState<EvidenceType>('partnership_agreement');
  const [evRef, setEvRef] = useState('');
  const [evExpires, setEvExpires] = useState('');
  const [addr, setAddr] = useState('');
  const [contact, setContact] = useState('');
  const [level, setLevel] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');

  const selected = clinics.find((c) => c.id === selectedId) ?? null;

  const fail = useCallback(
    (err: unknown) => {
      setNotice(null);
      setError(errorText(err));
    },
    [errorText],
  );

  // Sequence guards: only the newest list / evidence request may update state (stale responses are ignored, also after unmount).
  const loadSeq = useRef(0);
  const evidenceSeq = useRef(0);
  useEffect(
    () => () => {
      loadSeq.current += 1;
      evidenceSeq.current += 1;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!csrf) return;
    const mine = ++loadSeq.current;
    try {
      const data = await listAdminClinics(undefined, csrf);
      if (mine === loadSeq.current) setClinics(data);
    } catch (err) {
      if (mine === loadSeq.current) fail(err);
    }
  }, [csrf, fail]);

  const loadEvidence = useCallback(
    async (id: string) => {
      if (!csrf) return;
      const mine = ++evidenceSeq.current;
      try {
        const data = await listEvidence(id, undefined, csrf);
        if (mine === evidenceSeq.current) setEvidence(data);
      } catch (err) {
        if (mine !== evidenceSeq.current) return;
        setEvidence([]);
        fail(err);
      }
    },
    [csrf, fail],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (selectedId) void loadEvidence(selectedId);
  }, [selectedId, loadEvidence]);

  const choose = (id: string) => {
    setSelectedId(id);
    setError(null);
    setNotice(null);
    const c = clinics.find((x) => x.id === id);
    setStatus(c?.status ?? '');
  };

  const run = async (job: () => Promise<unknown>, done?: () => void) => {
    setError(null);
    setNotice(null);
    try {
      await job();
      done?.();
      await load();
      if (selectedId) await loadEvidence(selectedId);
    } catch (err) {
      fail(err);
      // A stale version means someone else changed the clinic: show the fresh record.
      await load();
    }
  };

  const onAddEvidence = (e: FormEvent) => {
    e.preventDefault();
    if (!csrf || !selected || !evRef.trim() || !evExpires) {
      setError('admin.err.validation_failed');
      return;
    }
    void run(
      () => addEvidence(selected.id, { evidenceType: evType, evidenceReference: evRef.trim(), expiresAt: expiryInstant(evExpires) }, csrf),
      () => {
        setEvRef('');
        setEvExpires('');
        setNotice('admin.clinics.saved');
      },
    );
  };

  const onVerification = (e: FormEvent) => {
    e.preventDefault();
    if (!csrf || !selected) return;
    const body: Record<string, unknown> = { expectedVersion: selected.version };
    if (addr) body.addressVerification = addr;
    if (contact) body.contactVerification = contact;
    if (level) body.verificationLevel = level;
    if (source.trim()) body.verificationSource = source.trim();
    if (!addr && !contact && !level) {
      setError('admin.clinics.noChange');
      return;
    }
    void run(
      () => updateClinicVerification(selected.id, body as ClinicVerificationUpdate, csrf),
      () => {
        setNotice('admin.clinics.saved');
        setAddr('');
        setContact('');
        setLevel('');
        setSource('');
      },
    );
  };

  const onStatus = (e: FormEvent) => {
    e.preventDefault();
    if (!csrf || !selected || !status) return;
    void run(
      () => updateClinicStatus(selected.id, { expectedVersion: selected.version, status: status as AdminClinic['status'] }, csrf),
      () => setNotice('admin.clinics.saved'),
    );
  };

  const onReview = (ev: Evidence, decision: 'accept' | 'reject') => {
    if (!csrf || !selected) return;
    void run(() => reviewEvidence(selected.id, ev.id, { decision }, csrf), () => setNotice('admin.clinics.saved'));
  };

  return (
    <>
      {!canWrite && <p className="field-hint">{t('admin.readOnly')}</p>}
      {error && (
        <p role="alert" className="field-error">
          {t(error)}
        </p>
      )}
      {notice && <p role="status">{t(notice)}</p>}
      <section className="card" aria-labelledby="admin-clinic-list-h">
        <h2 id="admin-clinic-list-h">{t('admin.clinics.list')}</h2>
        {clinics.length === 0 ? (
          <p>{t('admin.empty')}</p>
        ) : (
          <ul className="staff-list">
            {clinics.map((c) => (
              <li key={c.id}>
                <button type="button" className="btn btn--secondary" aria-pressed={c.id === selectedId} onClick={() => choose(c.id)}>
                  {c.name} ({label('enum', c.status)}, {label('enum', c.verificationLevel)})
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <section className="card" aria-labelledby="admin-clinic-detail-h">
          <h2 id="admin-clinic-detail-h">{selected.name}</h2>
          <p>
            {selected.municipality} - {t('admin.clinics.version')} {selected.version} - {t('admin.clinics.evidenceCount')}: {selected.validEvidenceCount}
          </p>
          <p>
            {t('admin.clinics.address')}: {label('enum', selected.addressVerification)}; {t('admin.clinics.contact')}: {label('enum', selected.contactVerification)}
          </p>
          {selected.verificationSource && (
            <p>
              {t('admin.clinics.source')}: {selected.verificationSource}
            </p>
          )}
          {selected.isDemo && (
            <p className="demo-banner-inline" data-testid="clinic-demo-locked">
              {t('admin.clinics.demoLocked')}
            </p>
          )}
          {!selected.isDemo && !selected.hasPublishEvidence && (
            <p className="field-hint" data-testid="clinic-publish-blocked">
              {t('admin.clinics.noPublishEvidence')}
            </p>
          )}

          <h3>{t('admin.clinics.evidence')}</h3>
          {evidence.length === 0 ? (
            <p>{t('admin.empty')}</p>
          ) : (
            <ul>
              {evidence.map((ev) => (
                <li key={ev.id}>
                  {label('evidence.type', ev.evidenceType)} - {ev.evidenceReference} - {label('enum', ev.status)}
                  {canWrite && ev.status === 'pending' && (
                    <span className="actions">
                      <button type="button" className="btn btn--secondary" onClick={() => onReview(ev, 'accept')}>
                        {t('admin.clinics.accept')}
                      </button>
                      <button type="button" className="btn btn--secondary" onClick={() => onReview(ev, 'reject')}>
                        {t('admin.clinics.reject')}
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && !selected.isDemo && (
            <>
              <form onSubmit={onAddEvidence} noValidate className="booking__form" aria-labelledby="admin-ev-h">
                <h3 id="admin-ev-h">{t('admin.clinics.addEvidence')}</h3>
                <div className="field">
                  <label className="field-label" htmlFor="ev-type">
                    {t('admin.clinics.evType')}
                  </label>
                  <select id="ev-type" className="input" value={evType} onChange={(e) => setEvType(e.target.value as EvidenceType)}>
                    {EVIDENCE_TYPES.map((x) => (
                      <option key={x} value={x}>
                        {label('evidence.type', x)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ev-ref">
                    {t('admin.clinics.evRef')}
                  </label>
                  <input id="ev-ref" className="input" value={evRef} onChange={(e) => setEvRef(e.target.value)} autoComplete="off" aria-describedby="ev-ref-hint" />
                  <p id="ev-ref-hint" className="field-hint">
                    {t('admin.clinics.evRefHint')}
                  </p>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ev-exp">
                    {t('admin.clinics.evExpires')}
                  </label>
                  <input id="ev-exp" type="date" className="input" value={evExpires} onChange={(e) => setEvExpires(e.target.value)} />
                </div>
                <button type="submit" className="btn">
                  {t('admin.clinics.addEvidence')}
                </button>
              </form>

              <form onSubmit={onVerification} noValidate className="booking__form" aria-labelledby="admin-ver-h">
                <h3 id="admin-ver-h">{t('admin.clinics.verification')}</h3>
                <div className="field">
                  <label className="field-label" htmlFor="ver-addr">
                    {t('admin.clinics.address')}
                  </label>
                  <select id="ver-addr" className="input" value={addr} onChange={(e) => setAddr(e.target.value)}>
                    <option value="">{t('admin.clinics.noFactChange')}</option>
                    {VERIFICATION_STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {label('enum', x)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ver-contact">
                    {t('admin.clinics.contact')}
                  </label>
                  <select id="ver-contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)}>
                    <option value="">{t('admin.clinics.noFactChange')}</option>
                    {VERIFICATION_STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {label('enum', x)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ver-level">
                    {t('admin.clinics.level')}
                  </label>
                  <select id="ver-level" className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
                    <option value="">{t('admin.clinics.noLevelChange')}</option>
                    {SETTABLE_VERIFICATION_LEVELS.map((x) => (
                      <option key={x} value={x}>
                        {label('enum', x)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="ver-source">
                    {t('admin.clinics.source')}
                  </label>
                  <input id="ver-source" className="input" value={source} onChange={(e) => setSource(e.target.value)} autoComplete="off" maxLength={300} aria-describedby="ver-source-hint" />
                  <p id="ver-source-hint" className="field-hint">
                    {t('admin.clinics.sourceHint')}
                  </p>
                </div>
                <button type="submit" className="btn">
                  {t('admin.clinics.setVerification')}
                </button>
              </form>

              <form onSubmit={onStatus} noValidate className="booking__form" aria-labelledby="admin-stat-h">
                <h3 id="admin-stat-h">{t('admin.clinics.publish')}</h3>
                <div className="field">
                  <label className="field-label" htmlFor="clinic-status">
                    {t('admin.clinics.publish')}
                  </label>
                  <select id="clinic-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {CLINIC_PUBLISH_STATUSES.map((x) => (
                      <option key={x} value={x}>
                        {label('enum', x)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn">
                  {t('admin.clinics.setStatus')}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </>
  );
}

export function AdminClinics() {
  return (
    <AdminFrame title="admin.clinics.title" roles={ROLES_CLINICS}>
      <ClinicsBody />
    </AdminFrame>
  );
}
