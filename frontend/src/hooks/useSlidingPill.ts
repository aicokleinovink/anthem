import { useLayoutEffect, useRef, useState } from 'react';

export interface PillGeometry {
  /** Distance from the container's start edge: left for 'x', top for 'y'. */
  start: number;
  /** Width for 'x', height for 'y'. */
  size: number;
}

export interface SlidingPill {
  ref: React.RefObject<HTMLDivElement | null>;
  /** null until the active item has been measured. */
  pill: PillGeometry | null;
  /** False for the first paint, so the pill appears in place instead of sliding in. */
  animated: boolean;
}

/**
 * Measures the active item so a single pill can slide between items — the toolbar's
 * selected tab and the pickers' selected row are the same idea on different axes.
 *
 * The `animated` flag matters: without it the first measurement moves the pill from
 * the container's corner to its real position *with the transition already on*, so
 * every card would animate its pill into place on load.
 */
export function useSlidingPill(
  axis: 'x' | 'y',
  /** The CSS-module class marking the active item; typed loosely because a module's
      class map is indexed and so may be undefined to TypeScript. */
  activeClass: string | undefined,
  deps: unknown[],
): SlidingPill {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<PillGeometry | null>(null);
  const [animated, setAnimated] = useState(false);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container || !activeClass) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(`.${activeClass}`);
      if (!active) {
        setPill(null);
        return;
      }
      setPill(
        axis === 'x'
          ? { start: active.offsetLeft, size: active.offsetWidth }
          : { start: active.offsetTop, size: active.offsetHeight },
      );
    };

    measure();
    // Keeps the pill right when labels reflow or the viewport changes.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axis, activeClass, ...deps]);

  // Turn the transition on one tick after the first position lands, never before.
  useLayoutEffect(() => {
    if (pill === null || animated) return;
    const timer = setTimeout(() => setAnimated(true), 0);
    return () => clearTimeout(timer);
  }, [pill, animated]);

  return { ref, pill, animated };
}
