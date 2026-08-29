import { useEffect, useRef, useState } from 'react';

/**
 * Holds the last non-null value for a moment after it disappears.
 *
 * Skipping a track leaves a gap where the streamer reports nothing at all. Without this
 * the mini player unmounts and remounts on every skip — a flash of empty space, and its
 * entrance animation replaying.
 */
export function useSustained<T>(value: T | null, holdMs: number): T | null {
  const [held, setHeld] = useState<T | null>(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);

    if (value !== null) {
      setHeld(value);
      return;
    }

    timer.current = setTimeout(() => setHeld(null), holdMs);
    return () => clearTimeout(timer.current);
  }, [value, holdMs]);

  return held;
}
