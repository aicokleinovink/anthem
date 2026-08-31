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

/**
 * How long a guess may outlive its write with no snapshot confirming it. Only reached
 * when the receiver quietly did something other than what was asked — it clamped the
 * value, or dropped the command — so this is what puts the truth back on screen.
 */
const CONFIRM_MS = 2_000;

/**
 * The fields a guess changed, as `section.field` paths.
 *
 * Only these decide whether a snapshot confirms the guess. Comparing whole sections
 * would not do: the receiver reports things around the change that move on their own —
 * switching input also changes the audio format, a moment later.
 */
function changedFields(guess: Snapshot, current: Snapshot | null): string[] {
  const paths: string[] = [];

  for (const [section, value] of Object.entries(guess)) {
    const before = (current as Record<string, unknown> | null)?.[section];
    if (JSON.stringify(value) === JSON.stringify(before)) continue;

    // Every write is `{ ...snapshot, section: { ...section, field: value } }`, so one
    // level down is as deep as a guess ever reaches.
    if (value && typeof value === 'object' && before && typeof before === 'object') {
      for (const field of Object.keys(value)) {
        const guessed = (value as Record<string, unknown>)[field];
        const known = (before as Record<string, unknown>)[field];
        if (JSON.stringify(guessed) !== JSON.stringify(known)) paths.push(`${section}.${field}`);
      }
    } else {
      paths.push(section);
    }
  }

  return paths;
}

/** Whether `next` agrees with the guess on every field the guess changed. */
function confirms(next: Snapshot, guess: Snapshot, paths: string[]): boolean {
  const at = (source: Snapshot, path: string) =>
    path
      .split('.')
      .reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], source);

  return paths.every((path) => JSON.stringify(at(next, path)) === JSON.stringify(at(guess, path)));
}

export interface ReceiverController {
  /** null until the first snapshot arrives. */
  snapshot: Snapshot | null;
  offline: boolean;
  busy: boolean;
  /**
   * Show `optimistic` at once and send the write. The guess stands until a snapshot
   * confirms it — not until the next snapshot of any kind, which is usually one the
   * receiver pushed before it had heard about the write. A failed write puts it back.
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
  /** The fields the current guess is waiting to have confirmed. */
  const pending = useRef<string[]>([]);
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);

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
        const next = JSON.parse(event.data) as Snapshot;
        setSnapshot(next);
        // Drop the guess only once the receiver agrees with it. A write draws snapshots
        // that still carry the old value — the API asks the receiver which input it is
        // on before writing, and every reply on the wire pushes state to every client —
        // so clearing on the first snapshot to arrive shows the old value again for the
        // ~200ms until the real one lands, which is what read as a flicker.
        setOptimistic((guess) => (guess && confirms(next, guess, pending.current) ? null : guess));
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

  useEffect(() => () => clearTimeout(giveUp.current), []);

  const write = useCallback(
    (next: Snapshot, send: () => Promise<unknown>) => {
      if (inFlight.current) return;

      inFlight.current = true;
      pending.current = changedFields(next, optimistic ?? snapshot);
      setBusy(true);
      setOptimistic(next);

      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => setOptimistic(null), CONFIRM_MS);

      void send()
        .then(() => setOffline(false))
        .catch(() => {
          // Nothing reached the receiver, so drop the guess and show the truth again.
          clearTimeout(giveUp.current);
          setOptimistic(null);
          setOffline(true);
        })
        .finally(() => {
          inFlight.current = false;
          setBusy(false);
        });
    },
    [optimistic, snapshot],
  );

  const reportWrite = useCallback((ok: boolean) => setOffline(!ok), []);

  return { snapshot: optimistic ?? snapshot, offline, busy, write, reportWrite };
}
