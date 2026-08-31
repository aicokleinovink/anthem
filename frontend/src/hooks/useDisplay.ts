import { useCallback, useMemo } from 'react';
import { setDisplay } from '../api';
import type { ReceiverController } from './useReceiver';

export interface DisplayController {
  options: Array<{ value: number; label: string }>;
  info: number | null;
  select: (info: number) => void;
}

/**
 * Front Panel Displayed Info — All or Volume Only.
 *
 * Not in Anthem's published protocol; the wire command came from reading the receiver's
 * own web app (see CLAUDE.md).
 */
export function useDisplay(receiver: ReceiverController): DisplayController {
  const { snapshot, write } = receiver;

  const select = useCallback(
    (info: number) => {
      if (!snapshot || info === snapshot.display.info) return;
      write({ ...snapshot, display: { ...snapshot.display, info } }, () => setDisplay(info));
    },
    [snapshot, write],
  );

  return useMemo(
    () => ({
      options: snapshot?.display.options ?? [],
      info: snapshot?.display.info ?? null,
      select,
    }),
    [snapshot, select],
  );
}
