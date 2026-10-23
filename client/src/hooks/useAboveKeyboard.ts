import { useEffect, useState, type RefObject } from 'react';

export interface Fit {
  /** Distance from the bottom of the card's container, in px. */
  bottom: number;
  /** Tallest the card may be without leaving the visible screen, in px. */
  maxHeight: number;
}

/** Room kept clear at the top of the screen, for the floating bar there, in px. */
const TOP_RESERVE = 72;
const MIN_HEIGHT = 160;

/**
 * Places a card that is anchored to the bottom of its (positioned) container so that it
 * stays on the visible part of the screen. The container is as tall as the page, so an
 * on-screen keyboard covers its bottom edge; while `typing`, the card moves up to sit on
 * the keyboard, and either way it is capped to the room there is (it should scroll inside).
 *
 * `rest` is the card's usual distance from the bottom, in px.
 */
export function useAboveKeyboard(
  ref: RefObject<HTMLElement | null>,
  rest: number,
  typing: boolean,
): Fit | null {
  const [fit, setFit] = useState<Fit | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const container = ref.current?.offsetParent;
      if (!container || !viewport) return setFit(null);
      const box = container.getBoundingClientRect();
      const visibleTop = Math.max(box.top, viewport.offsetTop);
      const visibleBottom = Math.min(box.bottom, viewport.offsetTop + viewport.height);
      // How much of the container's bottom the keyboard hides.
      const covered = Math.max(0, box.bottom - visibleBottom);
      const bottom = covered + (typing ? 8 : rest);
      const maxHeight = visibleBottom - visibleTop - (bottom - covered) - TOP_RESERVE;
      setFit({ bottom, maxHeight: Math.max(MIN_HEIGHT, maxHeight) });
    };

    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref, rest, typing]);

  return fit;
}
