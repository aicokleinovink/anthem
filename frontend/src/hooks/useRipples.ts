import { useCallback, useEffect, useRef, useState } from 'react';

export interface Ripple {
  id: number;
  direction: 'up' | 'down';
}

/** Long enough for the trailing ring to finish, then the element is dropped. */
const LIFETIME_MS = 950;

/** Rapid presses shouldn't pile up unbounded; only the most recent stay mounted. */
const MAX_RIPPLES = 6;

/**
 * Spawns an expanding (up) or contracting (down) ring for each press.
 * Silent when the viewer prefers reduced motion — nothing is rendered at all,
 * rather than rendering rings that skip straight to their end state.
 */
export function useRipples() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const spawn = useCallback((direction: Ripple['direction']) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const id = nextId.current++;
    setRipples((current) => [...current, { id, direction }].slice(-MAX_RIPPLES));

    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setRipples((current) => current.filter((ripple) => ripple.id !== id));
    }, LIFETIME_MS);
    timers.current.add(timer);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  return { ripples, spawn };
}
