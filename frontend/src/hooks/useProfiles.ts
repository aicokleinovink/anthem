import { useCallback, useMemo } from 'react';
import { setSpeakerProfile } from '../api';
import type { ReceiverController } from './useReceiver';

/**
 * Factory slot names. The receiver always reports four profiles; the ones nobody has
 * named still come back as "Profile3", "Profile4" and are noise in a picker.
 */
const UNNAMED = /^Profile\d+$/;

export interface SpeakerProfilesController {
  /** The named profiles, or all of them when none have been renamed. */
  profiles: Array<{ profile: number; value: number; name: string }>;
  selected: number | null;
  /** Speaker profile is a per-input setting, so the card names the input it applies to. */
  inputName: string | null;
  select: (value: number) => void;
}

/**
 * The receiver's speaker profiles, and switching between them.
 *
 * Values are 0-based while the profile numbers are 1-based, which is why `value` and
 * `profile` are separate fields and the picker keys off `value`.
 */
export function useProfiles(receiver: ReceiverController): SpeakerProfilesController {
  const { snapshot, write } = receiver;

  const select = useCallback(
    (value: number) => {
      if (!snapshot || value === snapshot.speakerProfile.selected) return;
      write(
        { ...snapshot, speakerProfile: { ...snapshot.speakerProfile, selected: value } },
        () => setSpeakerProfile(value),
      );
    },
    [snapshot, write],
  );

  return useMemo(() => {
    const all = snapshot?.speakerProfile.profiles ?? [];
    const named = all.filter((profile) => !UNNAMED.test(profile.name));

    return {
      // Show the named profiles; fall back to all of them if none have been renamed.
      profiles: named.length > 0 ? named : all,
      selected: snapshot?.speakerProfile.selected ?? null,
      inputName: snapshot?.speakerProfile.inputName ?? null,
      select,
    };
  }, [snapshot, select]);
}
