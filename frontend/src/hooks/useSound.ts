import { useCallback, useEffect, useRef, useState } from 'react';
import { setSound, type ToneControl } from '../api';
import type { ReceiverController } from './useReceiver';

export interface SoundControl {
  key: ToneControl;
  label: string;
  /** Level shown right now, including a drag not yet confirmed. */
  db: number | null;
}

export interface SoundController {
  controls: SoundControl[];
  minDb: number;
  maxDb: number;
  stepDb: number;
  set: (control: ToneControl, db: number) => void;
}

/** Fallbacks for the moment before the first snapshot; the API is the authority. */
const FALLBACK = { minDb: -10, maxDb: 10, stepDb: 0.5 };

/**
 * Bass, treble and subwoofer trim.
 *
 * Not in Anthem's published protocol; the wire commands came from reading the receiver's
 * own web app (see CLAUDE.md and the API README).
 *
 * Like volume, these need more than a plain optimistic write: a dragged slider produces
 * a value per frame and the receiver silently drops commands arriving back-to-back. So
 * the number moves at once, but only the *latest* value per control is kept, and one
 * in-flight slot is shared across all three — dragging one slider while another is still
 * being written must not put two commands on the wire at once.
 */
export function useSound(receiver: ReceiverController): SoundController {
  const { snapshot, reportWrite } = receiver;
  const [optimistic, setOptimistic] = useState<Partial<Record<ToneControl, number>>>({});
  /** The most recent level each slider asked for, waiting for the wire to clear. */
  const pending = useRef<Partial<Record<ToneControl, number>>>({});
  const inFlight = useRef(false);

  const sound = snapshot?.sound;

  const flush = useCallback(() => {
    if (inFlight.current) return;

    const [control] = Object.keys(pending.current) as ToneControl[];
    if (control === undefined) return;

    const db = pending.current[control]!;
    delete pending.current[control];
    inFlight.current = true;

    void setSound(control, db)
      .then(() => reportWrite(true))
      .catch(() => {
        // Nothing reached the receiver; fall back to whatever it last told us.
        pending.current = {};
        setOptimistic({});
        reportWrite(false);
      })
      .finally(() => {
        inFlight.current = false;
        flush(); // whatever landed while we waited
      });
  }, [reportWrite]);

  const set = useCallback(
    (control: ToneControl, db: number) => {
      const min = sound?.minDb ?? FALLBACK.minDb;
      const max = sound?.maxDb ?? FALLBACK.maxDb;
      const target = Math.min(Math.max(db, min), max);

      setOptimistic((current) => ({ ...current, [control]: target }));
      pending.current[control] = target;
      flush();
    },
    [flush, sound?.minDb, sound?.maxDb],
  );

  // Once nothing is outstanding, the stream's value is the truth again.
  useEffect(() => {
    if (Object.keys(pending.current).length === 0 && !inFlight.current) setOptimistic({});
  }, [snapshot]);

  return {
    controls: (sound?.controls ?? []).map((control) => ({
      key: control.key,
      label: control.label,
      db: optimistic[control.key] ?? control.db,
    })),
    minDb: sound?.minDb ?? FALLBACK.minDb,
    maxDb: sound?.maxDb ?? FALLBACK.maxDb,
    stepDb: sound?.stepDb ?? FALLBACK.stepDb,
    set,
  };
}
