import { useCallback, useMemo } from 'react';
import { selectTvTarget } from '../api';
import type { ReceiverController } from './useReceiver';

export interface TvController {
  /** False when the set is off — it cannot be woken over the network. */
  available: boolean;
  current: string | null;
  targets: Array<{ key: string; label: string }>;
  select: (target: string) => void;
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

  return useMemo(
    () => ({
      available: snapshot?.tv.available ?? false,
      current: snapshot?.tv.current ?? null,
      targets: snapshot?.tv.targets ?? [],
      select,
    }),
    [snapshot, select],
  );
}
