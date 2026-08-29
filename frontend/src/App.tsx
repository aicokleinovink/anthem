import { useState } from 'react';
import { InputsCard } from './cards/InputsCard';
import { SettingsCard } from './cards/SettingsCard';
import { VolumeCard } from './cards/VolumeCard';
import { SECTIONS, SECTION_PANEL_ID, Toolbar, type Section } from './components/Toolbar';
import { usePower } from './hooks/usePower';
import { useInputs } from './hooks/useInputs';
import { useDisplay } from './hooks/useDisplay';
import { useSpeakerProfiles } from './hooks/useSpeakerProfiles';
import { useVolume } from './hooks/useVolume';
import styles from './App.module.css';

export default function App() {
  const [section, setSection] = useState<Section>('volume');
  const [direction, setDirection] = useState<'right' | 'left'>('right');
  const { power, busy, offline: powerOffline, toggle } = usePower();
  // Both live here so they keep polling while another section is on screen — coming back
  // to a card should show the current state, not a fresh "connecting".
  const volume = useVolume();
  const inputs = useInputs();
  const profiles = useSpeakerProfiles();
  const display = useDisplay();

  // One notion of offline for the whole app: everything talks to the same API, so if any
  // of them cannot reach it, no control on screen can do anything.
  const offline =
    powerOffline || volume.offline || inputs.offline || profiles.offline || display.offline;

  // Cards enter from whichever side you moved towards in the toolbar, so the swap
  // reads as travelling with the sliding pill rather than as an unrelated fade.
  const select = (next: Section) => {
    setDirection(SECTIONS.indexOf(next) > SECTIONS.indexOf(section) ? 'right' : 'left');
    setSection(next);
  };

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <Toolbar
          section={section}
          onSelect={select}
          power={power}
          powerBusy={busy}
          offline={offline}
          onTogglePower={toggle}
        />

        {/*
          The card is the panel the tabs control, so screen readers announce the switch
          rather than leaving the tabs pointing at nothing.

          The keys matter: Inputs and Settings are the same component in the same slot, so
          without distinct keys React would reuse the instance and the entrance would not
          replay when switching between them.
        */}
        <div
          className={`${styles.stage} ${direction === 'left' ? styles.stageLeft : ''}`}
          id={SECTION_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`tab-${section}`}
        >
          {section === 'volume' && (
            <VolumeCard key="volume" controller={volume} powerOn={power} offline={offline} />
          )}
          {section === 'inputs' && (
            <InputsCard key="inputs" controller={inputs} powerOn={power} offline={offline} />
          )}
          {section === 'settings' && (
            <SettingsCard
              key="settings"
              profiles={profiles}
              display={display}
              powerOn={power}
              offline={offline}
            />
          )}
        </div>
      </div>
    </main>
  );
}
