import { useCallback } from 'react';
import { getPower, setPower, type Power } from '../api';
import { usePolled } from './usePolled';

/** Slower than volume: power rarely changes, and each poll is a device query. */
const POLL_MS = 4000;

export interface PowerController {
  /** null until the first answer arrives. */
  power: boolean | null;
  busy: boolean;
  offline: boolean;
  toggle: () => void;
}

export function usePower(): PowerController {
  const { data, offline, busy, update } = usePolled<Power>(getPower, POLL_MS);
  const power = data?.power ?? null;

  const toggle = useCallback(() => {
    if (power === null) return;
    const target = !power;
    update({ power: target }, () => setPower(target));
  }, [power, update]);

  return { power, busy, offline, toggle };
}
