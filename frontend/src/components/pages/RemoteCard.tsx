import { sendTvKey, type TvKeyName } from '../../api';
import { Card } from '../shared/Card';
import { Panel } from '../shared/Panel';
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
 * Nothing here is optimistic and nothing here has a selected state. A press is an event,
 * not a setting — the TV has no way to report what its menu is doing, so the card shows
 * only whether the set can be reached at all.
 */
export function RemoteCard({ controller, offline }: RemoteCardProps) {
  const { available } = controller;
  const locked = offline || !available;

  // The failure that matters is a key paired before the app asked for the permission the
  // input socket needs; the API says so in its message, and there is nothing the UI can
  // do about it, so a press that fails is simply a press that did nothing.
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
      {/*
        A fixed four-column row, holding one button so far. The columns are what keep the
        cog where it is when the next three arrive, rather than having it drift left of
        centre and move later.
      */}
      <Panel title="Menu">
        <div className={styles.actions}>
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.action}
              disabled={locked}
              aria-label={action.label}
              onClick={() => press(action.key)}
            >
              {action.icon}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Navigate">
        {/*
          A three-by-three grid with the arrows on the cross and OK in the middle: the
          shape of the thing it stands for, so it needs no labels to be read.
        */}
        <div className={styles.pad}>
          <PadKey className={styles.up} label="Up" onPress={() => press('up')} disabled={locked}>
            <Chevron rotate={0} />
          </PadKey>
          <PadKey
            className={styles.left}
            label="Left"
            onPress={() => press('left')}
            disabled={locked}
          >
            <Chevron rotate={-90} />
          </PadKey>
          <button
            type="button"
            className={`${styles.ok} ${styles.centre}`}
            disabled={locked}
            aria-label="OK"
            onClick={() => press('enter')}
          >
            OK
          </button>
          <PadKey
            className={styles.right}
            label="Right"
            onPress={() => press('right')}
            disabled={locked}
          >
            <Chevron rotate={90} />
          </PadKey>
          <PadKey
            className={styles.down}
            label="Down"
            onPress={() => press('down')}
            disabled={locked}
          >
            <Chevron rotate={180} />
          </PadKey>
        </div>

        {/* Back sits under the pad rather than on it: it leaves where you are, and the
            cross is for moving within it. */}
        <div className={styles.below}>
          <button
            type="button"
            className={styles.back}
            disabled={locked}
            onClick={() => press('back')}
          >
            Back
          </button>
        </div>
      </Panel>
    </Card>
  );
}

function PadKey({
  className = '',
  label,
  disabled,
  onPress,
  children,
}: {
  /* CSS Modules class lookups are `string | undefined` under
     `noUncheckedIndexedAccess`, so the grid-area class arrives optional. */
  className?: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.padKey} ${className}`}
      disabled={disabled}
      aria-label={label}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

/** One glyph at four rotations, so the four arrows cannot drift apart. */
function Chevron({ rotate }: { rotate: number }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M6 14.5L12 8.5l6 6" transform={`rotate(${rotate} 12 12)`} />
    </svg>
  );
}

/**
 * The row above the pad. One entry today; the grid holds four columns so adding the
 * next three moves nothing that is already there.
 */
const ACTIONS: Array<{ key: TvKeyName; label: string; icon: React.ReactNode }> = [
  {
    key: 'menu',
    label: 'Settings menu',
    icon: (
      <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">
        {/* An eight-tooth cog, drawn rather than imported: one more dependency for one
            icon is not worth it, and every other glyph here is inline too. */}
        <path
          d="M9.57 1.89 L14.43 1.89 L13.73 4.80 L15.87 5.69 L17.43 3.13 L20.87 6.57 L18.31 8.13 L19.20 10.27 L22.11 9.57 L22.11 14.43 L19.20 13.73 L18.31 15.87 L20.87 17.43 L17.43 20.87 L15.87 18.31 L13.73 19.20 L14.43 22.11 L9.57 22.11 L10.27 19.20 L8.13 18.31 L6.57 20.87 L3.13 17.43 L5.69 15.87 L4.80 13.73 L1.89 14.43 L1.89 9.57 L4.80 10.27 L5.69 8.13 L3.13 6.57 L6.57 3.13 L8.13 5.69 L10.27 4.80 Z"
          className={styles.cog}
        />
        <circle cx="12" cy="12" r="3.4" className={styles.cogHole} />
      </svg>
    ),
  },
];
