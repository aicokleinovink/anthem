import { useEffect, useState } from 'react';
import { MIN_DB, playerAction, seekPlayer, type NowPlaying, type PlayerAction } from '../../api';
import type { VolumeController } from '../../hooks/useVolume';
import type { Morph } from '../../hooks/usePlayerMorph';
import styles from './Player.module.css';

interface PlayerProps {
  now: NowPlaying;
  /** Nothing can reach the API, so the transport buttons would do nothing. */
  offline: boolean;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  /** Geometry between the strip and the card slot, and the drag-to-collapse gesture. */
  morph: Morph;
  /** Only used by the expanded player; the strip has no room for a level. */
  volume: VolumeController;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Artwork is one element that grows, rather than two that cross-fade at different sizes. */
const ART = {
  small: { size: 52, top: 12, radius: 17 },
  /*
   * The expanded cover is capped rather than simply filling the width. The player is the
   * height of a card, and the title, scrub bar, transport and volume below it need a
   * fixed amount of that — so the artwork gets whatever is left, and on a narrow screen
   * the width takes over as the limit.
   */
  large: { top: 30, radius: 34, max: 164, margin: 48 },
};

export function Player({
  now,
  offline,
  expanded,
  onExpand,
  onCollapse,
  morph,
  volume,
}: PlayerProps) {
  const [elapsed, setElapsed] = useState(now.elapsed ?? 0);
  const [artworkFailed, setArtworkFailed] = useState(false);
  /** Where the finger has the scrub handle, which wins over the counter until released. */
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  /*
   * The position has to run locally. The streamer's status only changes when something
   * actually happens — a track change, play, pause — so it does not report each passing
   * second; a long-poll can sit for a minute with the position quietly advancing.
   */
  useEffect(() => {
    setElapsed(now.elapsed ?? 0);
  }, [now.elapsed, now.title]);

  useEffect(() => {
    // While a finger is on the scrub handle the counter would be fighting it.
    if (now.state !== 'playing' || scrubbing !== null) return;
    const timer = setInterval(() => {
      setElapsed((current) => (now.duration ? Math.min(current + 1, now.duration) : current + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [now.state, now.duration, scrubbing !== null]);

  useEffect(() => setArtworkFailed(false), [now.image]);

  const playing = now.state === 'playing';
  const loading = now.state === 'loading';
  const position = scrubbing ?? elapsed;
  const fraction = now.duration ? Math.min(position / now.duration, 1) : 0;
  const seekable = now.canSeek && now.duration !== null && !offline;

  const send = (action: PlayerAction) => {
    void playerAction(action).catch(() => {
      // The streamer's own status is the truth; it will correct us either way.
    });
  };

  const commitSeek = () => {
    if (scrubbing === null) return;
    const target = scrubbing;
    setScrubbing(null);
    // Show the new position straight away; the streamer confirms it a moment later.
    setElapsed(target);
    void seekPlayer(target).catch(() => {});
  };

  const p = morph.progress;
  const width = morph.frame?.width ?? 0;

  // Everything inside is placed from the artwork, so the two layouts cannot drift apart
  // as it grows. The values go out as custom properties and the stylesheet reads them.
  const large = Math.max(0, Math.min(width - ART.large.margin * 2, ART.large.max));
  const artSize = lerp(ART.small.size, large, p);
  const artTop = lerp(ART.small.top, ART.large.top, p);
  const artLeft = lerp(ART.small.top, (width - artSize) / 2, p);

  const surface = {
    ...morph.frame,
    '--art-size': `${artSize}px`,
    '--art-top': `${artTop}px`,
    '--art-left': `${artLeft}px`,
    '--art-radius': `${lerp(ART.small.radius, ART.large.radius, p)}px`,
    // Ends on the card's own radius, since expanded it stands in the card's place.
    '--radius': `${lerp(26, 28, p)}px`,
    // Each layout is gone before the other arrives, so they never overlap mid-morph.
    '--mini-opacity': Math.max(0, 1 - p * 2.4),
    '--big-opacity': Math.max(0, (p - 0.55) / 0.45),
  } as React.CSSProperties;

  const mini = p < 0.5;
  /*
   * Both layouts exist only while the morph is actually running. At rest one of them is
   * gone from the DOM entirely, so the track title and the transport buttons appear
   * exactly once — a hidden copy of both would be ambiguous to anything reading the page.
   */
  const showMini = p < 1;
  const showBig = p > 0;

  return (
    <section
      className={[
        styles.player,
        loading ? styles.loading : '',
        expanded ? styles.expanded : '',
        morph.dragging ? styles.dragging : '',
        morph.frame ? '' : styles.unmeasured,
      ].join(' ')}
      style={surface}
      aria-label="Now playing"
    >
      {now.image && !artworkFailed ? (
        <img className={styles.art} src={now.image} alt="" onError={() => setArtworkFailed(true)} />
      ) : (
        <div className={`${styles.art} ${styles.artFallback}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width={`${Math.round(artSize * 0.42)}`} fill="currentColor">
            <path d="M9 18V5l10-2v13" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="16" r="2.5" />
          </svg>
        </div>
      )}

      {/*
        Mid-morph both layouts are on screen at once, and `inert` keeps the one on its way
        out off the accessibility tree and out of the tab order — otherwise there would
        briefly be two "Pause" buttons.
      */}
      {showMini && (
        <div className={styles.mini} inert={!mini} aria-hidden={!mini}>
          {/*
            The strip itself is what opens the player, so nothing has to spend room on a
            chevron. It is a real button underneath the layout rather than a click handler
            on the surface, so it can be tabbed to and announced — and it stays a sibling
            of the transport buttons, because a button inside a button is invalid.
          */}
          <button
            type="button"
            className={styles.expand}
            aria-label="Expand player"
            onClick={onExpand}
          />

          <div className={styles.text}>
            <span className={styles.title}>{now.title ?? 'Unknown track'}</span>
            <span className={styles.artist}>{now.artist ?? now.service ?? ''}</span>
          </div>

          <div className={styles.controls}>
            <Skip direction="previous" disabled={offline} onPress={() => send('previous')} />
            <PlayPause
              playing={playing}
              disabled={offline}
              onPress={() => send(playing ? 'pause' : 'play')}
            />
            <Skip direction="next" disabled={offline} onPress={() => send('next')} />
          </div>

          <div className={styles.progressRow}>
            <span className={styles.time}>{clock(position)}</span>
            <span className={styles.bar}>
              <span
                className={styles.progress}
                style={{ width: `${fraction * 100}%` }}
                aria-hidden="true"
              />
            </span>
            {/* Live radio has no length, so there is nothing to count towards. */}
            <span className={styles.time}>{now.duration ? clock(now.duration) : 'live'}</span>
          </div>
        </div>
      )}

      {showBig && (
        <div className={styles.big} inert={mini} aria-hidden={mini}>
          {/*
            The grab bar is also the control. Dragging is a pointer gesture with no
            keyboard equivalent, so the bar is a button that collapses on click or Enter
            as well as starting the drag — the same pill, honest about being operable.
          */}
          <button
            type="button"
            className={styles.handle}
            aria-label="Collapse player"
            onPointerDown={morph.onDragStart}
            // A release at the end of a drag fires a click too; that one is not a press.
            onClick={() => {
              if (!morph.dragged()) onCollapse();
            }}
          >
            <span className={styles.grabber} aria-hidden="true" />
          </button>

          <div className={styles.bigText}>
            <span className={styles.bigTitle}>{now.title ?? 'Unknown track'}</span>
            <span className={styles.bigArtist}>{now.artist ?? now.service ?? ''}</span>
            {now.album && <span className={styles.bigAlbum}>{now.album}</span>}
          </div>

          <div className={styles.scrub}>
            <input
              type="range"
              className={styles.range}
              min={0}
              max={now.duration ?? 1}
              step={1}
              value={now.duration ? Math.min(position, now.duration) : 0}
              disabled={!seekable}
              aria-label="Seek"
              style={{ '--filled': `${fraction * 100}%` } as React.CSSProperties}
              onChange={(event) => setScrubbing(Number(event.target.value))}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
              onBlur={commitSeek}
            />
            <div className={styles.scrubTimes}>
              <span className={styles.time}>{clock(position)}</span>
              <span className={styles.time}>
                {now.duration ? `−${clock(now.duration - position)}` : 'live'}
              </span>
            </div>
          </div>

          <div className={styles.bigControls}>
            <Skip direction="previous" big disabled={offline} onPress={() => send('previous')} />
            <PlayPause
              big
              playing={playing}
              disabled={offline}
              onPress={() => send(playing ? 'pause' : 'play')}
            />
            <Skip direction="next" big disabled={offline} onPress={() => send('next')} />
          </div>

          <Volume volume={volume} disabled={offline} />
        </div>
      )}
    </section>
  );
}

/** The receiver's level, not the streamer's — the only thing here that is not the player. */
function Volume({ volume, disabled }: { volume: VolumeController; disabled: boolean }) {
  const { displayDb, maxDb, muted, set } = volume;
  const ready = displayDb !== null;
  const fraction = ready ? (displayDb - MIN_DB) / (maxDb - MIN_DB) : 0;

  return (
    <div className={styles.volume}>
      <Speaker level={0} />
      <input
        type="range"
        className={styles.range}
        min={MIN_DB}
        max={maxDb}
        step={1}
        value={ready ? displayDb : MIN_DB}
        disabled={disabled || !ready}
        aria-label="Volume"
        aria-valuetext={ready ? `${displayDb} decibels` : undefined}
        style={{ '--filled': `${fraction * 100}%` } as React.CSSProperties}
        onChange={(event) => set(Number(event.target.value))}
      />
      <Speaker level={muted ? 0 : 2} />
    </div>
  );
}

function Speaker({ level }: { level: number }) {
  return (
    <svg className={styles.speaker} viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" fill="currentColor" />
      {level > 0 && (
        <path
          d="M15.4 9.2a4 4 0 010 5.6M18 6.8a7.4 7.4 0 010 10.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function Skip({
  direction,
  disabled,
  big,
  onPress,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  big?: boolean;
  onPress: () => void;
}) {
  const size = big ? 27 : 21;
  return (
    <button
      type="button"
      className={`${styles.skip} ${big ? styles.skipBig : ''}`}
      disabled={disabled}
      aria-label={direction === 'next' ? 'Next track' : 'Previous track'}
      onClick={onPress}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        {direction === 'next' ? (
          <path d="M14.8 6H17v12h-2.2zM4 6l9.2 6L4 18z" />
        ) : (
          <path d="M7 6h2.2v12H7zM20 6v12l-9.2-6z" />
        )}
      </svg>
    </button>
  );
}

function PlayPause({
  playing,
  disabled,
  big,
  onPress,
}: {
  playing: boolean;
  disabled: boolean;
  big?: boolean;
  onPress: () => void;
}) {
  const size = big ? 24 : 18;
  return (
    <button
      type="button"
      className={`${styles.play} ${big ? styles.playBig : ''}`}
      disabled={disabled}
      aria-label={playing ? 'Pause' : 'Play'}
      onClick={onPress}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M8 5h3.1v14H8zM12.9 5H16v14h-3.1z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M8.5 5l11 7-11 7z" />
        </svg>
      )}
    </button>
  );
}
