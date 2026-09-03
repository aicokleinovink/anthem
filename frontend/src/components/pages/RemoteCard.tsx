import { sendTvKey, type TvKeyName } from '../../api';
import { Card } from '../shared/Card';
import type { TvController } from '../../hooks/useTvTargets';
import styles from './RemoteCard.module.css';

interface RemoteCardProps {
  /** Owned by the app, not by this card — see InputsCard. */
  controller: TvController;
  offline: boolean;
}

/**
 * The set's own remote: the keys the physical one sends, over the second socket webOS
 * hands out for them (see the API's `tv/keys.ts`).
 *
 * Built like the volume card rather than like the pill cards: one big round control is
 * the whole of it, with a row of small keys under it. The four directions are wedges of
 * a single disc, not four separate buttons on a page — the pad is one object, the way
 * the dial is one object, and the outlined panel the pill lists use would put a box
 * around something that is already a shape.
 *
 * Nothing here is optimistic and nothing has a selected state. A press is an event, not
 * a setting: the TV cannot report what its menu is doing, so the card shows only whether
 * the set can be reached.
 */
export function RemoteCard({ controller, offline }: RemoteCardProps) {
  const { available } = controller;
  const locked = offline || !available;

  // A key paired before the app asked for the input-socket permission is the failure
  // that matters, and no UI can fix it — the API's message says what to do. So a press
  // that fails is simply a press that did nothing.
  const press = (key: TvKeyName) => {
    void sendTvKey(key).catch(() => {});
  };

  return (
    <Card
      title="Remote"
      // Same three states as the TV card, and for the same reason: the set cannot be
      // woken over the network, so "Off" is the end of the story.
      status={offline ? 'Offline' : available ? 'On' : 'Off'}
      statusStrong={offline || !available}
      dimmed={locked}
    >
      <div className={`${styles.pad} ${locked ? styles.padLocked : ''}`}>
        {DIRECTIONS.map(({ key, label, area, rotate }) => (
          <button
            key={key}
            type="button"
            className={`${styles.wedge} ${styles[area] ?? ''}`}
            disabled={locked}
            aria-label={label}
            onClick={() => press(key)}
          >
            {/* One glyph at four rotations, so the arrows cannot drift apart. */}
            <svg viewBox="0 0 24 24" width="27" height="27" aria-hidden="true">
              <path d="M6 14.5L12 8.5l6 6" transform={`rotate(${rotate} 12 12)`} />
            </svg>
          </button>
        ))}

        {/* Last, so it sits over the wedges' apexes rather than under them. */}
        <button
          type="button"
          className={styles.ok}
          disabled={locked}
          aria-label="OK"
          onClick={() => press('enter')}
        >
          OK
        </button>
      </div>

      {/* The small keys, in the same centred row the volume card puts its steps in. */}
      <div className={styles.keys}>
        {KEYS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={styles.key}
            disabled={locked}
            aria-label={entry.label}
            onClick={() => press(entry.key)}
          >
            {entry.icon}
          </button>
        ))}
      </div>
    </Card>
  );
}

/** The four wedges, in the order they are read out rather than the order they are drawn. */
const DIRECTIONS: Array<{ key: TvKeyName; label: string; area: string; rotate: number }> = [
  { key: 'up', label: 'Up', area: 'up', rotate: 0 },
  { key: 'right', label: 'Right', area: 'right', rotate: 90 },
  { key: 'down', label: 'Down', area: 'down', rotate: 180 },
  { key: 'left', label: 'Left', area: 'left', rotate: -90 },
];

const KEYS: Array<{ key: TvKeyName; label: string; icon: React.ReactNode }> = [
  {
    key: 'menu',
    label: 'Settings menu',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        {/* An eight-tooth cog, drawn rather than imported: one dependency for one icon is
            not worth it, and every other glyph here is inline too. */}
        <path
          className={styles.solid}
          d="M9.57 1.89 L14.43 1.89 L13.73 4.80 L15.87 5.69 L17.43 3.13 L20.87 6.57 L18.31 8.13 L19.20 10.27 L22.11 9.57 L22.11 14.43 L19.20 13.73 L18.31 15.87 L20.87 17.43 L17.43 20.87 L15.87 18.31 L13.73 19.20 L14.43 22.11 L9.57 22.11 L10.27 19.20 L8.13 18.31 L6.57 20.87 L3.13 17.43 L5.69 15.87 L4.80 13.73 L1.89 14.43 L1.89 9.57 L4.80 10.27 L5.69 8.13 L3.13 6.57 L6.57 3.13 L8.13 5.69 L10.27 4.80 Z"
        />
        {/* Punched out, so the card's glass shows through the middle of the cog. */}
        <circle className={styles.hole} cx="12" cy="12" r="3.4" />
      </svg>
    ),
  },
  {
    key: 'back',
    label: 'Back',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M10 6.5L4.5 12l5.5 5.5M4.5 12h11a4 4 0 010 8h-2" />
      </svg>
    ),
  },
];
