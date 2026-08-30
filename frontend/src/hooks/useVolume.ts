import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_DB, MIN_DB, setVolumeDb, stepVolume } from '../api';
import type { ReceiverController } from './useReceiver';

export interface VolumeController {
  /** Level shown right now, including presses not yet confirmed. */
  displayDb: number | null;
  muted: boolean;
  maxDb: number;
  step: (steps: number) => void;
  /**
   * Jump straight to a level, for the player's slider. Subject to the same coalescing as
   * the buttons — a drag produces far more values than the receiver will accept.
   */
  set: (db: number) => void;
}

/**
 * Volume needs more than a plain optimistic write, so it keeps its own.
 *
 * Presses are *coalesced*: the number moves on every press, but while a request is in
 * flight further presses accumulate and go out as a single `{ steps: N }` when it
 * returns. That keeps us from flooding the receiver, which silently drops commands
 * arriving too fast — the same behaviour the API's paced transport exists to handle.
 *
 * A dragged slider needs the same protection for a different reason: it produces a value
 * per frame, and only the last one matters. So an absolute write holds the *latest*
 * target rather than accumulating, and both kinds of write share one in-flight slot —
 * otherwise a slider drag and a button press could be on the wire at the same time and
 * land in either order.
 */
export function useVolume(receiver: ReceiverController): VolumeController {
  const { snapshot, reportWrite } = receiver;
  const [optimisticDb, setOptimisticDb] = useState<number | null>(null);
  const pendingSteps = useRef(0);
  /** The most recent level a drag asked for, waiting for the wire to clear. */
  const pendingDb = useRef<number | null>(null);
  const inFlight = useRef(false);

  const volume = snapshot?.volume;
  const displayDb = optimisticDb ?? volume?.db ?? null;

  const flush = useCallback(() => {
    if (inFlight.current) return;

    // Steps first: a press is a discrete action, where a superseded drag value is not.
    const write =
      pendingSteps.current !== 0
        ? stepVolume(pendingSteps.current)
        : pendingDb.current !== null
          ? setVolumeDb(pendingDb.current)
          : null;
    if (write === null) return;

    pendingSteps.current = 0;
    pendingDb.current = null;
    inFlight.current = true;

    void write
      .then(() => reportWrite(true))
      .catch(() => {
        // Nothing reached the receiver; fall back to whatever it last told us.
        pendingSteps.current = 0;
        pendingDb.current = null;
        setOptimisticDb(null);
        reportWrite(false);
      })
      .finally(() => {
        inFlight.current = false;
        flush(); // whatever landed while we waited
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

  const set = useCallback(
    (db: number) => {
      const target = Math.min(Math.max(Math.round(db), MIN_DB), volume?.maxDb ?? MAX_DB);
      setOptimisticDb(target);
      pendingDb.current = target;
      flush();
    },
    [flush, volume?.maxDb],
  );

  // Once nothing is outstanding, the stream's value is the truth again.
  useEffect(() => {
    if (pendingSteps.current === 0 && pendingDb.current === null && !inFlight.current) {
      setOptimisticDb(null);
    }
  }, [snapshot]);

  return {
    displayDb,
    muted: volume?.muted ?? false,
    maxDb: volume?.maxDb ?? MAX_DB,
    step,
    set,
  };
}
