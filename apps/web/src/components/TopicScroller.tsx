import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

/**
 * One-line, sideways-scrolling list (the topic filter). Touch users swipe; mouse users get previous/next buttons
 * because a hidden scrollbar leaves them no way to reach the chips that do not fit. Keyboard users can already
 * Tab through the chips, and focus scrolls them into view. The buttons are hidden on phones (see cards.css).
 */
export function TopicScroller({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const listRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const scrollBy = (dir: -1 | 1) => {
    const el = listRef.current;
    if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="topic-scroller">
      <button type="button" className="topic-scroller__btn" disabled={atStart} onClick={() => scrollBy(-1)}>
        <ChevronLeft size={20} aria-hidden="true" />
        <span className="sr-only">{t('learn.topics.prev')}</span>
      </button>
      <ul className="topic-grid" ref={listRef} onScroll={update}>
        {children}
      </ul>
      <button type="button" className="topic-scroller__btn" disabled={atEnd} onClick={() => scrollBy(1)}>
        <ChevronRight size={20} aria-hidden="true" />
        <span className="sr-only">{t('learn.topics.next')}</span>
      </button>
    </div>
  );
}
