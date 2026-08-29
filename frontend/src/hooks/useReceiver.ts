import { useCallback, useEffect, useRef, useState } from 'react';
import { EVENTS_URL, type Snapshot } from '../api';

/**
 * How long without any traffic before we call it offline. The server pings every 10s,
 * so this allows two to go missing. It matters because a proxy can keep the connection
 * open after the service behind it dies: the stream simply goes quiet, EventSource never
 * errors, and without this the UI would sit there looking live for ever.
 */
const STALE_MS = 25_000;

/**
 * Reconnection is ours, not EventSource's. The browser abandons a stream permanently
 * when it gets a non-200 — which is exactly what a proxy returns while the service
 * behind it restarts — so relying on its built-in retry leaves the page dead until
 * someone reloads it.
 */
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 15_000;

export interface ReceiverController {
  /** null until the first snapshot arrives. */
  snapshot: Snapshot | null;
  offline: boolean;
  busy: boolean;
  /**
   * Show `optimistic` at once and send the write. The receiver pushes the result to
   * everyone, so the next snapshot replaces it; a failed write puts it back.
   *
   * One at a time: a second call while one is in flight is ignored. Volume is the
   * exception and manages its own queue — see useVolume.
   */
  write: (optimistic: Snapshot, send: () => Promise<unknown>) => void;
  /** For writes that manage themselves, so a failure still reads as offline. */
  reportWrite: (ok: boolean) => void;
}

/**
 * One connection for the whole app state.
 *
 * The receiver pushes every change to every client — volume, input, speaker profile and
 * the display setting all arrive unasked, within about 50ms — so nothing here polls.
 * EventSource reconnects on its own if the stream drops.
 */
export function useReceiver(): ReceiverController {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [optimistic, setOptimistic] = useState<Snapshot | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let source: EventSource | null = null;
    let watchdog: ReturnType<typeof setTimeout>;
    let retry: ReturnType<typeof setTimeout>;
    let delay = RETRY_MIN_MS;
    let stopped = false;

    const heard = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(reconnect, STALE_MS);
      delay = RETRY_MIN_MS;
      setOffline(false);
    };

    const connect = () => {
      source = new EventSource(EVENTS_URL);

      source.onmessage = (event) => {
        heard();
        setSnapshot(JSON.parse(event.data) as Snapshot);
        // Whatever the receiver just told us outranks anything we were guessing.
        setOptimistic(null);
      };

      // Keeps the watchdog fed while nothing is changing.
      source.addEventListener('ping', heard);
      source.onerror = reconnect;

      clearTimeout(watchdog);
      watchdog = setTimeout(reconnect, STALE_MS);
    };

    function reconnect() {
      if (stopped) return;
      setOffline(true);
      clearTimeout(watchdog);
      source?.close();
      source = null;
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, RETRY_MAX_MS);
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(watchdog);
      clearTimeout(retry);
      source?.close();
    };
  }, []);

  const write = useCallback((next: Snapshot, send: () => Promise<unknown>) => {
    if (inFlight.current) return;

    inFlight.current = true;
    setBusy(true);
    setOptimistic(next);

    void send()
      .then(() => setOffline(false))
      .catch(() => {
        // Nothing reached the receiver, so drop the guess and show the truth again.
        setOptimistic(null);
        setOffline(true);
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  }, []);

  const reportWrite = useCallback((ok: boolean) => setOffline(!ok), []);

  return { snapshot: optimistic ?? snapshot, offline, busy, write, reportWrite };
}
