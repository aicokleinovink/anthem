import { useCallback, useEffect, useRef, useState } from 'react';
import { stepTvBacklight } from '../api';
import type { ReceiverController } from './useReceiver';

export interface BacklightController {
  /** OLED pixel brightness shown right now, presses included, or null if unknown. */
  value: number | null;
  /** False when the set cannot be reached; then there is nothing to show or move. */
  available: boolean;
  step: (steps: number) => void;
}

/**
 * The TV's OLED pixel brightness, with its own write queue.
 *
 * It cannot use `receiver.write`, which drops a second write while one is in flight —
 * fine for a setting you change once, wrong for a button you press four times in a row.
 * Every press after the first moved the number on screen and never left the browser, and
 * the next snapshot pulled the display back to where the set actually was.
 *
 * So this coalesces the way `useVolume` does: the number moves on every press, presses
 * accumulate while a request is out, and what accumulated goes as a single `{ steps: N }`
 * when the wire clears. The API adds them to *its* pending target rather than to a value
 * read back from the set, because the set reports the old number until it has applied
 * the change.
 */
export function useBacklight(receiver: ReceiverController): BacklightController {
  const { snapshot, reportWrite } = receiver;
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const pendingSteps = useRef(0);
  const inFlight = useRef(false);

  const reported = snapshot?.tv.backlight ?? null;
  const available = snapshot?.tv.available ?? false;
  const value = optimistic ?? reported;

  const flush = useCallback(() => {
    if (inFlight.current || pendingSteps.current === 0) return;

    const steps = pendingSteps.current;
    pendingSteps.current = 0;
    inFlight.current = true;

    void stepTvBacklight(steps)
      .then(() => reportWrite(true))
      .catch(() => {
        // Nothing reached the set — including the case of a client key paired before the
        // settings permissions, which cannot write at all. Show the truth again.
        pendingSteps.current = 0;
        setOptimistic(null);
        reportWrite(false);
      })
      .finally(() => {
        inFlight.current = false;
        flush(); // whatever was pressed while we waited
      });
  }, [reportWrite]);

  const step = useCallback(
    (steps: number) => {
      setOptimistic((current) => {
        const base = current ?? reported;
        if (base === null) return current;
        return Math.min(100, Math.max(0, base + steps));
      });
      // Only queue a write if there is a value to move from; otherwise the press was on
      // a card that has nothing to show, and the API would reject it anyway.
      if ((optimistic ?? reported) === null) return;
      pendingSteps.current += steps;
      flush();
    },
    [flush, optimistic, reported],
  );

  // Once nothing is outstanding, the stream's value is the truth again.
  useEffect(() => {
    if (pendingSteps.current === 0 && !inFlight.current) setOptimistic(null);
  }, [snapshot]);

  return { value, available, step };
}
