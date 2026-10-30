import { useId, useState, type FormEvent } from 'react';
import { REMINDER_CHANNELS, type ReminderChannel } from '@kalinga/shared';
import { setReminderPreference } from '../api/bookings';
import { ApiRequestError } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';

interface Props {
  /** Called at submit time so the secret is read from memory only when needed; never rendered or stored here. */
  getCredentials: () => { reference: string; secret: string } | null;
}

/**
 * Opt-in neutral reminders (DEMO mock). Explicit Yes/No (nothing preselected); shown only after a successful status lookup. No phone number or
 * e-mail address is collected: only a mock channel is chosen.
 */
export function ReminderOptIn({ getCredentials }: Props) {
  const { t, locale } = useI18n();
  const uid = useId();
  // Nothing is preselected: a reminder is never implied by a default, and Save stays disabled until a choice is made.
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const enabled = choice === 'yes';
  const [channel, setChannel] = useState<ReminderChannel>('mock_sms');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const creds = getCredentials();
    setMessage(null);
    if (choice === null) return;
    if (!creds) {
      setMessage({ kind: 'error', text: t('reminder.expired') });
      return;
    }
    setPending(true);
    try {
      const r = await setReminderPreference({ ...creds, optIn: enabled, ...(enabled ? { channel } : {}), locale });
      setMessage({ kind: 'ok', text: t(r.optedIn ? 'reminder.saved.on' : 'reminder.saved.off') });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 429) setMessage({ kind: 'error', text: t('reminder.throttled') });
      else if (err instanceof ApiRequestError && err.status === 404) setMessage({ kind: 'error', text: t('reminder.expired') });
      else setMessage({ kind: 'error', text: t('reminder.error') });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card reminder" aria-labelledby={`${uid}-title`} data-testid="reminder-optin">
      <h2 id={`${uid}-title`}>{t('reminder.title')}</h2>
      <p>{t('reminder.intro')}</p>
      <p className="field-hint">{t('reminder.demo')}</p>
      <p className="field-hint">{t('reminder.pendingNote')}</p>
      <form onSubmit={(e) => void onSubmit(e)} className="booking__form" method="post" action="#">
        <fieldset className="field">
          <legend className="field-label">{t('reminder.choice')}</legend>
          {(['yes', 'no'] as const).map((c) => (
            <label key={c} className="check" htmlFor={`${uid}-choice-${c}`}>
              <input id={`${uid}-choice-${c}`} type="radio" name={`${uid}-choice`} value={c} checked={choice === c} onChange={() => setChoice(c)} />{' '}
              {t(`reminder.choice.${c}`)}
            </label>
          ))}
        </fieldset>
        {enabled && (
          <fieldset className="field">
            <legend className="field-label">{t('reminder.channel')}</legend>
            {REMINDER_CHANNELS.map((c) => (
              <label key={c} className="check" htmlFor={`${uid}-${c}`}>
                <input id={`${uid}-${c}`} type="radio" name={`${uid}-channel`} value={c} checked={channel === c} onChange={() => setChannel(c)} />{' '}
                {t(`reminder.channel.${c}`)}
              </label>
            ))}
          </fieldset>
        )}
        <div className="actions">
          <button type="submit" className="btn btn--secondary" disabled={pending || choice === null} aria-busy={pending}>
            {t(pending ? 'reminder.saving' : 'reminder.save')}
          </button>
        </div>
        {choice === null && <p className="field-hint">{t('reminder.choose')}</p>}
        <p role={message?.kind === 'error' ? 'alert' : 'status'} className={message?.kind === 'error' ? 'field-error' : 'field-hint'} data-testid="reminder-message">
          {message?.text ?? ''}
        </p>
      </form>
    </section>
  );
}
