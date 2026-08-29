import { useCallback, useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  /** null until the first answer arrives. */
  data: T | null;
  offline: boolean;
  /** A write is in flight. */
  busy: boolean;
  /**
   * Apply `optimistic` at once, send the write, then adopt whatever the receiver
   * confirms — or put the previous value back if the write never landed.
   */
  update: (optimistic: T, send: () => Promise<T>) => void;
}

/**
 * The shared shape of every control in this app: poll the API for the truth, write
 * optimistically, and treat a failure as "offline" so the UI can disable itself.
 *
 * Having one of these matters beyond tidiness — the rollback-on-failure below used to be
 * written out per hook, and three of the four had quietly omitted it, leaving the UI
 * showing a selection the receiver had never accepted.
 */
export function usePolled<T>(read: () => Promise<T>, intervalMs: number): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const inFlight = useRef(false);
  // Mirrors `data` so a write can capture the previous value without reading state
  // inside an updater (React may invoke those more than once).
  const latest = useRef<T | null>(null);
  // Lets callers pass an inline reader without restarting the polling effect.
  const readRef = useRef(read);
  readRef.current = read;

  const apply = useCallback((next: T | null) => {
    latest.current = next;
    setData(next);
  }, []);

  const update = useCallback(
    (optimistic: T, send: () => Promise<T>) => {
      if (inFlight.current) return;

      const previous = latest.current;
      inFlight.current = true;
      setBusy(true);
      apply(optimistic);

      void send()
        .then((confirmed) => {
          apply(confirmed);
          setOffline(false);
        })
        .catch(() => {
          apply(previous);
          setOffline(true);
        })
        .finally(() => {
          inFlight.current = false;
          setBusy(false);
        });
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;

    // `force` is for the very first read: a tab that opens in the background should
    // still show the real state rather than sitting on "connecting".
    const poll = async (force = false) => {
      if (inFlight.current) return;
      if (document.hidden && !force) return;
      try {
        const next = await readRef.current();
        if (cancelled || inFlight.current) return;
        apply(next);
        setOffline(false);
      } catch {
        if (!cancelled) setOffline(true);
      }
    };

    void poll(true);
    const timer = setInterval(() => void poll(), intervalMs);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply, intervalMs]);

  return { data, offline, busy, update };
}
