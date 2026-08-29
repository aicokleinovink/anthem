import { useCallback } from 'react';
import { getDisplay, setDisplay, type Display, type DisplayOption } from '../api';
import { usePolled } from './usePolled';

/** A setup value: it only changes when someone changes it. */
const POLL_MS = 5000;

export interface DisplayController {
  options: DisplayOption[];
  /** 0 = All, 1 = Volume Only. */
  info: number | null;
  offline: boolean;
  select: (info: number) => void;
}

/** Setup > General > Front Panel Displayed Info, in Anthem's own menu. */
export function useDisplay(): DisplayController {
  const { data, offline, update } = usePolled<Display>(getDisplay, POLL_MS);

  const select = useCallback(
    (info: number) => {
      if (!data || info === data.info) return;
      update({ ...data, info }, () => setDisplay(info));
    },
    [data, update],
  );

  return { options: data?.options ?? [], info: data?.info ?? null, offline, select };
}
