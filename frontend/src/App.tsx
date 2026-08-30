import { useState } from 'react';
import { selectInput, selectTvTarget, setDisplay, setPower, setSpeakerProfile } from './api';
import { InputsCard } from './components/pages/InputsCard';
import { SettingsCard } from './components/pages/SettingsCard';
import { TvCard } from './components/pages/TvCard';
import { VolumeCard } from './components/pages/VolumeCard';
import { MiniPlayer } from './components/shared/MiniPlayer';
import { SECTIONS, SECTION_PANEL_ID, Toolbar, type Section } from './components/shared/Toolbar';
import { useReceiver } from './hooks/useReceiver';
import { useSustained } from './hooks/useSustained';
import { useVolume } from './hooks/useVolume';
import styles from './App.module.css';

/**
 * Factory slot names. The receiver always reports four profiles; the ones nobody has
 * named still come back as "Profile3", "Profile4" and are noise in a picker.
 */
const UNNAMED = /^Profile\d+$/;

/** How long the mini player stays put while the streamer moves between tracks. */
const PLAYER_HOLD_MS = 4000;

export default function App() {
  const [section, setSection] = useState<Section>('volume');
  const [direction, setDirection] = useState<'right' | 'left'>('right');

  // One stream feeds every card, and keeps running while another card is on screen.
  const receiver = useReceiver();
  const volume = useVolume(receiver);
  const { snapshot, offline, busy, write } = receiver;

  const power = snapshot?.power ?? null;

  // Skipping leaves a gap where the streamer reports nothing; hold the player through it
  // rather than letting it blink out and back.
  const playing = useSustained(snapshot?.player ?? null, PLAYER_HOLD_MS);

  const togglePower = () => {
    if (!snapshot || power === null) return;
    const target = !power;
    write({ ...snapshot, power: target }, () => setPower(target));
  };

  const inputs = {
    inputs: snapshot?.inputs.list ?? [],
    selected: snapshot?.inputs.selected ?? null,
    format: snapshot?.inputs.format ?? null,
    select: (input: number) => {
      if (!snapshot || input === snapshot.inputs.selected) return;
      write(
        // The format belongs to the old source; drop it until the receiver reports
        // what is arriving on the new one.
        { ...snapshot, inputs: { ...snapshot.inputs, selected: input, format: null } },
        () => selectInput(input),
      );
    },
  };

  const all = snapshot?.speakerProfile.profiles ?? [];
  const named = all.filter((profile) => !UNNAMED.test(profile.name));
  const profiles = {
    // Show the named profiles; fall back to all of them if none have been renamed.
    profiles: named.length > 0 ? named : all,
    selected: snapshot?.speakerProfile.selected ?? null,
    inputName: snapshot?.speakerProfile.inputName ?? null,
    select: (value: number) => {
      if (!snapshot || value === snapshot.speakerProfile.selected) return;
      write(
        { ...snapshot, speakerProfile: { ...snapshot.speakerProfile, selected: value } },
        () => setSpeakerProfile(value),
      );
    },
  };

  const tv = {
    available: snapshot?.tv.available ?? false,
    current: snapshot?.tv.current ?? null,
    targets: snapshot?.tv.targets ?? [],
    select: (target: string) => {
      if (!snapshot || target === snapshot.tv.current) return;
      write({ ...snapshot, tv: { ...snapshot.tv, current: target } }, () => selectTvTarget(target));
    },
  };

  const display = {
    options: snapshot?.display.options ?? [],
    info: snapshot?.display.info ?? null,
    select: (info: number) => {
      if (!snapshot || info === snapshot.display.info) return;
      write({ ...snapshot, display: { ...snapshot.display, info } }, () => setDisplay(info));
    },
  };

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
          onTogglePower={togglePower}
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
          {section === 'tv' && <TvCard key="tv" controller={tv} offline={offline} />}
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

        {/* Sits below whichever card is showing, for as long as something is playing. */}
        {playing && <MiniPlayer now={playing} offline={offline} />}
      </div>
    </main>
  );
}
