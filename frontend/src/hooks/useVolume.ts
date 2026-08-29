import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_DB, MIN_DB, stepVolume } from '../api';
import type { ReceiverController } from './useReceiver';

export interface VolumeController {
  /** Level shown right now, including presses not yet confirmed. */
  displayDb: number | null;
  muted: boolean;
  maxDb: number;
  step: (steps: number) => void;
}

/**
 * Volume needs more than a plain optimistic write, so it keeps its own.
 *
 * Presses are *coalesced*: the number moves on every press, but while a request is in
 * flight further presses accumulate and go out as a single `{ steps: N }` when it
 * returns. That keeps us from flooding the receiver, which silently drops commands
 * arriving too fast — the same behaviour the API's paced transport exists to handle.
 */
export function useVolume(receiver: ReceiverController): VolumeController {
  const { snapshot, reportWrite } = receiver;
  const [optimisticDb, setOptimisticDb] = useState<number | null>(null);
  const pendingSteps = useRef(0);
  const inFlight = useRef(false);

  const volume = snapshot?.volume;
  const displayDb = optimisticDb ?? volume?.db ?? null;

  const flush = useCallback(() => {
    if (inFlight.current || pendingSteps.current === 0) return;

    const steps = pendingSteps.current;
    pendingSteps.current = 0;
    inFlight.current = true;

    void stepVolume(steps)
      .then(() => reportWrite(true))
      .catch(() => {
        // Nothing reached the receiver; fall back to whatever it last told us.
        pendingSteps.current = 0;
        setOptimisticDb(null);
        reportWrite(false);
      })
      .finally(() => {
        inFlight.current = false;
        flush(); // presses that landed while we waited
      });
  }, [reportWrite]);

  const step = useCallback(
    (steps: number) => {
      setOptimisticDb((current) => {
        const base = current ?? volume?.db ?? null;
        if (base === null) return current;
        return Math.min(Math.max(base + steps, MIN_DB), volume?.maxDb ?? MAX_DB);
      });
      pendingSteps.current += steps;
      flush();
    },
    [flush, volume?.db, volume?.maxDb],
  );

  // Once nothing is outstanding, the stream's value is the truth again.
  useEffect(() => {
    if (pendingSteps.current === 0 && !inFlight.current) setOptimisticDb(null);
  }, [snapshot]);

  return {
    displayDb,
    muted: volume?.muted ?? false,
    maxDb: volume?.maxDb ?? MAX_DB,
    step,
  };
}
