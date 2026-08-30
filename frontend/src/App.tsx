import { useCallback, useEffect, useRef, useState } from 'react';
import { selectInput, selectTvTarget, setDisplay, setPower, setSpeakerProfile } from './api';
import { InputsCard } from './components/pages/InputsCard';
import { SettingsCard } from './components/pages/SettingsCard';
import { TvCard } from './components/pages/TvCard';
import { VolumeCard } from './components/pages/VolumeCard';
import { DeviceSwitcher } from './components/shared/DeviceSwitcher';
import { Player } from './components/shared/Player';
import {
  DEVICES,
  SECTIONS,
  SECTION_PANEL_ID,
  Toolbar,
  type Device,
  type Section,
} from './components/shared/Toolbar';
import { usePlayerMorph } from './hooks/usePlayerMorph';
import { useReceiver } from './hooks/useReceiver';
import { useSustained } from './hooks/useSustained';
import { useVolume } from './hooks/useVolume';
import styles from './App.module.css';

/**
 * Factory slot names. The receiver always reports four profiles; the ones nobody has
 * named still come back as "Profile3", "Profile4" and are noise in a picker.
 */
const UNNAMED = /^Profile\d+$/;

/** How long the player stays put while the streamer moves between tracks. */
const PLAYER_HOLD_MS = 4000;

export default function App() {
  const [device, setDevice] = useState<Device>('anthem');
  const [section, setSection] = useState<Section>('volume');
  const [direction, setDirection] = useState<'right' | 'left'>('right');
  /** The player only ever opens because someone asked it to — never on a track change. */
  const [expanded, setExpanded] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // One stream feeds every card, and keeps running while another card is on screen.
  const receiver = useReceiver();
  const volume = useVolume(receiver);
  const { snapshot, offline, busy, write } = receiver;

  const power = snapshot?.power ?? null;

  const collapse = useCallback(() => setExpanded(false), []);
  const morph = usePlayerMorph(expanded, collapse, {
    shell: shellRef,
    stage: stageRef,
    strip: stripRef,
  });

  // Skipping leaves a gap where the streamer reports nothing; hold the player through it
  // rather than letting it blink out and back.
  const playing = useSustained(snapshot?.player ?? null, PLAYER_HOLD_MS);

  // The player is gone once the streamer stops, and it must not come back open: expanding
  // is only ever something you asked for, and that ask does not survive the track.
  useEffect(() => {
    if (!playing) setExpanded(false);
  }, [playing]);

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
  const sections = SECTIONS[device];

  // Navigating away is also a way out of the expanded player: one tap both closes it and
  // goes where you asked, rather than making you close it first.
  const select = (next: Section) => {
    setExpanded(false);
    setDirection(sections.indexOf(next) > sections.indexOf(section) ? 'right' : 'left');
    setSection(next);
  };

  const selectDevice = (next: Device) => {
    if (next === device) return;
    setExpanded(false);
    setDirection(DEVICES.indexOf(next) > DEVICES.indexOf(device) ? 'right' : 'left');
    setDevice(next);
    // Inputs exists under both devices and means the same thing there — that device's
    // sources — so it carries across; anything else falls back to the device's first
    // section.
    setSection(SECTIONS[next].includes(section) ? section : SECTIONS[next][0]);
  };

  return (
    <main className={styles.screen}>
      <div className={styles.shell} ref={shellRef}>
        {/* Switcher and toolbar sit close together as one block of chrome. */}
        <div className={styles.chrome}>
          <DeviceSwitcher device={device} onSelect={selectDevice} />

          <Toolbar
            device={device}
            section={section}
            onSelect={select}
            power={power}
            powerBusy={busy}
            offline={offline}
            onTogglePower={togglePower}
          />
        </div>

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
          ref={stageRef}
          // The expanded player covers the card completely; leaving it reachable would
          // put a screenful of hidden controls in the tab order behind it.
          inert={expanded}
        >
          {device === 'tv' && section === 'inputs' && (
            <TvCard key="tv-inputs" controller={tv} offline={offline} />
          )}
          {device === 'anthem' && section === 'volume' && (
            <VolumeCard key="volume" controller={volume} powerOn={power} offline={offline} />
          )}
          {device === 'anthem' && section === 'inputs' && (
            <InputsCard key="inputs" controller={inputs} powerOn={power} offline={offline} />
          )}
          {device === 'anthem' && section === 'settings' && (
            <SettingsCard
              key="settings"
              profiles={profiles}
              display={display}
              powerOn={power}
              offline={offline}
            />
          )}
        </div>

        {/*
          The player is positioned over the shell rather than laid out in it, so it can
          move between the two slots. This empty div is the slot it collapses to: it keeps
          the space below the card reserved whether the player is down here or not.
        */}
        {playing && <div className={styles.strip} ref={stripRef} aria-hidden="true" />}
        {playing && (
          <Player
            now={playing}
            offline={offline}
            expanded={expanded}
            onExpand={() => setExpanded(true)}
            onCollapse={collapse}
            morph={morph}
            volume={volume}
          />
        )}
      </div>
    </main>
  );
}
