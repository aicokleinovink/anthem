import { useCallback, useEffect, useRef, useState } from 'react';
import { getVolume, MAX_DB, MIN_DB, stepVolume, type Volume } from '../api';

const POLL_MS = 2000;

export interface VolumeController {
  volume: Volume | null;
  /** Level shown right now — the optimistic value while a step is in flight. */
  displayDb: number | null;
  offline: boolean;
  step: (steps: number) => void;
}

/**
 * Owns all talking to the API.
 *
 * Presses move the number immediately and are *coalesced*: while a request is in
 * flight, further presses accumulate and go out as one `{ steps: N }` when it returns.
 * That keeps us from flooding the receiver, which silently drops commands that arrive
 * too fast — the same behaviour the API's paced transport exists to handle.
 */
export function useVolume(): VolumeController {
  const [volume, setVolume] = useState<Volume | null>(null);
  const [optimisticDb, setOptimisticDb] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  const pendingSteps = useRef(0);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current || pendingSteps.current === 0) return;

    const steps = pendingSteps.current;
    pendingSteps.current = 0;
    inFlight.current = true;

    try {
      const next = await stepVolume(steps);
      setVolume(next);
      setOffline(false);
      // Any presses that landed while we waited are still pending; send them too.
      if (pendingSteps.current === 0) setOptimisticDb(null);
    } catch {
      setOffline(true);
      setOptimisticDb(null);
      pendingSteps.current = 0;
    } finally {
      inFlight.current = false;
      void flush();
    }
  }, []);

  const step = useCallback(
    (steps: number) => {
      setOptimisticDb((current) => {
        const base = current ?? volume?.db ?? null;
        if (base === null) return current;
        const ceiling = volume?.maxDb ?? MAX_DB;
        return Math.min(Math.max(base + steps, MIN_DB), ceiling);
      });
      pendingSteps.current += steps;
      void flush();
    },
    [flush, volume],
  );

  // Poll so the dial follows the physical remote. Skipped while a step is in flight
  // (its own reply is fresher) and while the tab is hidden.
  useEffect(() => {
    let cancelled = false;

    // `force` is used for the very first load: a tab that opens in the background
    // should still paint the real level rather than sit on "connecting".
    const poll = async (force = false) => {
      if (inFlight.current) return;
      if (document.hidden && !force) return;
      try {
        const next = await getVolume();
        if (cancelled) return;
        setVolume(next);
        setOffline(false);
        if (pendingSteps.current === 0 && !inFlight.current) setOptimisticDb(null);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    void poll(true);
    const timer = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { volume, displayDb: optimisticDb ?? volume?.db ?? null, offline, step };
}
