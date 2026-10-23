import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TbChevronLeft, TbChevronRight } from 'react-icons/tb';
import { useI18n } from '../i18n';
import { surface, hoverRow } from './ui';

/** Share of the visible width one arrow click scrolls by. */
const STEP = 0.75;

/**
 * A horizontally scrolling row with a `<` / `>` button at each end, shown only while there
 * is more to see in that direction. Touch can swipe the row, but a mouse can't: the
 * scrollbar is hidden and the wheel only scrolls vertically.
 */
export function ScrollRow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // A pixel of slack, since scrollLeft can be fractional.
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  // Re-check when the row or its content changes size (a new chip, a resize).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [update, children]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scroller.current;
    el?.scrollBy({ left: direction * el.clientWidth * STEP, behavior: 'smooth' });
  };

  const arrow = (direction: -1 | 1) => {
    const Icon = direction < 0 ? TbChevronLeft : TbChevronRight;
    return (
      <button
        type="button"
        aria-label={direction < 0 ? t('scroll.left') : t('scroll.right')}
        className={`absolute top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full shadow-lg ${surface} ${hoverRow} ${
          direction < 0 ? 'left-0' : 'right-0'
        }`}
        onClick={() => scrollBy(direction)}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={update}
        className={`flex gap-2 overflow-x-auto [scrollbar-width:none] ${className}`}
      >
        {children}
      </div>
      {more.left && arrow(-1)}
      {more.right && arrow(1)}
    </div>
  );
}
