import { useCallback, useMemo } from 'react';
import { selectInput } from '../api';
import type { ReceiverController } from './useReceiver';

export interface InputsController {
  /** The receiver's own sources, names and all. Empty until the first snapshot. */
  inputs: Array<{ input: number; name: string }>;
  selected: number | null;
  /** The format of the signal actually arriving, or null when nothing is known. */
  format: string | null;
  select: (input: number) => void;
}

/**
 * The receiver's inputs, and switching between them.
 *
 * Owned by the app rather than by the card: switching tabs unmounts the card, and state
 * living there would reset to "connecting" every time you came back.
 */
export function useInputs(receiver: ReceiverController): InputsController {
  const { snapshot, write } = receiver;

  const select = useCallback(
    (input: number) => {
      if (!snapshot || input === snapshot.inputs.selected) return;
      write(
        // The format belongs to the old source; drop it until the receiver reports
        // what is arriving on the new one.
        { ...snapshot, inputs: { ...snapshot.inputs, selected: input, format: null } },
        () => selectInput(input),
      );
    },
    [snapshot, write],
  );

  return useMemo(
    () => ({
      inputs: snapshot?.inputs.list ?? [],
      selected: snapshot?.inputs.selected ?? null,
      format: snapshot?.inputs.format ?? null,
      select,
    }),
    [snapshot, select],
  );
}
