import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { Locale } from '@kalinga/shared';
import { MessageCircleHeart, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { MAX_INPUT_LENGTH, clampInput, matchIntent } from './engine';
import { GREETING_INTENT_ID, chipLabelId, getIntent, quickRepliesFor, type Intent, type IntentId } from './registry';

/**
 * Floating DEMO guide. Scripted and local: no network calls, no model, no logging, nothing persisted.
 * The conversation lives in component state of <AssistantPanel> only, so it is cleared when the panel closes or the page reloads.
 */

type Message =
  | { key: number; from: 'user'; text: string }
  | { key: number; from: 'guide'; intentId: IntentId };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AssistantWidget() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <aside className="assistant" aria-label={t('assistant.label')} data-testid="assistant">
      <button
        ref={triggerRef}
        type="button"
        className="assistant__fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MessageCircleHeart size={24} aria-hidden="true" />
        <span>{t('assistant.open')}</span>
      </button>
      {open && <AssistantPanel id={panelId} onClose={close} />}
    </aside>
  );
}

function AssistantPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, setLocale } = useI18n();
  const { pathname } = useLocation();
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextKey = useRef(1);
  const [messages, setMessages] = useState<Message[]>([{ key: 0, from: 'guide', intentId: GREETING_INTENT_ID }]);
  const [draft, setDraft] = useState('');

  // Move focus into the dialog on open.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Escape closes from anywhere (the page is never locked, so focus may be outside the panel).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  const reply = (userText: string, intent: Intent) => {
    setMessages((prev) => [
      ...prev,
      { key: nextKey.current++, from: 'user', text: userText },
      { key: nextKey.current++, from: 'guide', intentId: intent.id as IntentId },
    ]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = clampInput(draft).trim();
    if (!text) return;
    reply(text, matchIntent(text));
    setDraft('');
  };

  // Keep Tab inside the dialog (non-modal otherwise: no scroll lock, no inert page).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={panelRef}
      id={id}
      className="assistant__panel"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <div className="assistant__header">
        <h2 id={titleId} className="assistant__title">{t('assistant.title')}</h2>
        <button type="button" className="assistant__close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
          <span className="sr-only">{t('assistant.close')}</span>
        </button>
      </div>
      <p id={descId} className="assistant__disclaimer">{t('assistant.disclaimer')}</p>

      {/* Polite live region (a log, deliberately not role=status). Focusable so a scrolled log is keyboard reachable. */}
      <div
        ref={logRef}
        className="assistant__log"
        role="log"
        aria-live="polite"
        aria-label={t('assistant.conversation')}
        tabIndex={0}
      >
        {messages.map((m) =>
          m.from === 'user' ? (
            <div key={m.key} className="assistant__msg assistant__msg--user">
              <span className="sr-only">{t('assistant.from.you')} </span>
              <p>{m.text}</p>
            </div>
          ) : (
            <GuideMessage key={m.key} intent={getIntent(m.intentId)} onNavigate={onClose} onLocale={setLocale} />
          ),
        )}
      </div>

      <div role="group" aria-label={t('assistant.quickLabel')} className="assistant__chips">
        {quickRepliesFor(pathname).map((intent) => {
          const labelId = chipLabelId(intent);
          return (
            <button
              key={intent.id}
              type="button"
              className={intent.urgent === true ? 'assistant__chip assistant__chip--urgent' : 'assistant__chip'}
              onClick={() => labelId && reply(t(labelId), intent)}
            >
              {labelId ? t(labelId) : intent.id}
            </button>
          );
        })}
      </div>

      <form className="assistant__form" onSubmit={onSubmit}>
        <label htmlFor={inputId} className="assistant__label">{t('assistant.inputLabel')}</label>
        <p className="assistant__privacy">{t('assistant.privacy')}</p>
        <div className="assistant__row">
          <input
            id={inputId}
            type="text"
            className="assistant__input"
            value={draft}
            maxLength={MAX_INPUT_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setDraft(clampInput(e.target.value))}
          />
          <button type="submit" className="btn btn--primary assistant__send">{t('assistant.send')}</button>
        </div>
      </form>
    </div>
  );
}

function GuideMessage({
  intent,
  onNavigate,
  onLocale,
}: {
  intent: Intent;
  onNavigate: () => void;
  onLocale: (l: Locale) => void;
}) {
  const { t } = useI18n();
  const urgent = intent.urgent === true;
  return (
    <div className={urgent ? 'assistant__msg assistant__msg--guide assistant__msg--urgent' : 'assistant__msg assistant__msg--guide'}>
      <span className="sr-only">{t('assistant.from.guide')} </span>
      {urgent && intent.titleId && (
        <p className="assistant__urgent-title">
          <TriangleAlert size={20} aria-hidden="true" />
          <strong>{t(intent.titleId)}</strong>
        </p>
      )}
      <p>{t(intent.replyId)}</p>
      {(intent.links.length > 0 || (intent.actions?.length ?? 0) > 0) && (
        <ul className="assistant__links">
          {intent.links.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="assistant__link" onClick={onNavigate}>{t(l.labelId)}</Link>
            </li>
          ))}
          {intent.actions?.map((a) => (
            <li key={`${a.type}-${a.locale}`}>
              <button type="button" className="assistant__link assistant__link--button" onClick={() => onLocale(a.locale)}>
                {t(a.labelId)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
