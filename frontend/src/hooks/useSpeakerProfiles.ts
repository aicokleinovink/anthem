import { useCallback } from 'react';
import { getSpeakerProfiles, setSpeakerProfile, type SpeakerProfile, type SpeakerProfiles } from '../api';
import { usePolled } from './usePolled';

/** A setup value: it only changes when someone changes it. */
const POLL_MS = 5000;

/**
 * Factory slot names. The receiver always reports four profiles; the ones nobody has
 * named still come back as "Profile3", "Profile4" and are noise in a picker.
 */
const UNNAMED = /^Profile\d+$/;

export interface SpeakerProfilesController {
  profiles: SpeakerProfile[];
  selected: number | null;
  /** The input the profile applies to — it is a per-input setting. */
  inputName: string | null;
  offline: boolean;
  select: (value: number) => void;
}

export function useSpeakerProfiles(): SpeakerProfilesController {
  const { data, offline, update } = usePolled<SpeakerProfiles>(getSpeakerProfiles, POLL_MS);

  const select = useCallback(
    (value: number) => {
      if (!data || value === data.selected) return;

      update({ ...data, selected: value }, () =>
        setSpeakerProfile(value).then((next) => ({ ...data, selected: next.selected })),
      );
    },
    [data, update],
  );

  // Show the named profiles; fall back to all of them if none have been renamed.
  const all = data?.profiles ?? [];
  const named = all.filter((profile) => !UNNAMED.test(profile.name));

  return {
    profiles: named.length > 0 ? named : all,
    selected: data?.selected ?? null,
    inputName: data?.inputName ?? null,
    offline,
    select,
  };
}
