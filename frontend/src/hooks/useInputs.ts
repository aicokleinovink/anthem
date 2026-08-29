import { useCallback } from 'react';
import { getInputs, selectInput, type InputOption, type Inputs } from '../api';
import { usePolled } from './usePolled';

/** Slower than volume: the source changes rarely, and each poll is two device queries. */
const POLL_MS = 3000;

export interface InputsController {
  inputs: InputOption[];
  /** null until the first answer arrives. */
  selected: number | null;
  format: string | null;
  offline: boolean;
  select: (input: number) => void;
}

export function useInputs(): InputsController {
  const { data, offline, update } = usePolled<Inputs>(getInputs, POLL_MS);

  const select = useCallback(
    (input: number) => {
      if (!data || input === data.selected) return;

      update(
        // The format belongs to the old source, so drop it until the receiver reports
        // what is arriving on the new one.
        { ...data, selected: input, format: null },
        () => selectInput(input).then((next) => ({ ...data, selected: next.selected, format: null })),
      );
    },
    [data, update],
  );

  return {
    inputs: data?.inputs ?? [],
    selected: data?.selected ?? null,
    format: data?.format ?? null,
    offline,
    select,
  };
}
