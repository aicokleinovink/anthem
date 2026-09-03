import { useCallback, useMemo } from 'react';
import { selectTvTarget, stepTvBacklight } from '../api';
import type { ReceiverController } from './useReceiver';

export interface TvController {
  /** False when the set is off — it cannot be woken over the network. */
  available: boolean;
  current: string | null;
  targets: Array<{ key: string; label: string }>;
  select: (target: string) => void;
  /** OLED pixel brightness the set last reported, 0-100, or null if it has not. */
  backlight: number | null;
  /** Move it by so many points; the set decides where that lands. */
  stepBacklight: (steps: number) => void;
}

/**
 * The TV's own sources: switching the set's input, or launching an app on it.
 *
 * The selection is not assumed — the API subscribes to whatever the set reports as its
 * foreground app, so the highlight follows the TV even when its own remote changes it.
 */
export function useTvTargets(receiver: ReceiverController): TvController {
  const { snapshot, write } = receiver;

  const select = useCallback(
    (target: string) => {
      if (!snapshot || target === snapshot.tv.current) return;
      write({ ...snapshot, tv: { ...snapshot.tv, current: target } }, () => selectTvTarget(target));
    },
    [snapshot, write],
  );

  /*
   * Optimistic, like the receiver's own writes: the number moves at once and the set
   * corrects it a moment later when the API has read it back. Without this a press
   * would sit there doing nothing for as long as the alert bridge takes.
   */
  const stepBacklight = useCallback(
    (steps: number) => {
      if (!snapshot || snapshot.tv.backlight === null) return;
      const optimistic = Math.min(100, Math.max(0, snapshot.tv.backlight + steps));
      write({ ...snapshot, tv: { ...snapshot.tv, backlight: optimistic } }, () =>
        stepTvBacklight(steps),
      );
    },
    [snapshot, write],
  );

  return useMemo(
    () => ({
      available: snapshot?.tv.available ?? false,
      current: snapshot?.tv.current ?? null,
      targets: snapshot?.tv.targets ?? [],
      select,
      backlight: snapshot?.tv.backlight ?? null,
      stepBacklight,
    }),
    [snapshot, select, stepBacklight],
  );
}
