import { useEffect, useState } from 'react';
import { playerAction, type NowPlaying, type PlayerAction } from '../api';
import styles from './MiniPlayer.module.css';

interface MiniPlayerProps {
  now: NowPlaying;
  /** Nothing can reach the API, so the transport buttons would do nothing. */
  offline: boolean;
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function MiniPlayer({ now, offline }: MiniPlayerProps) {
  const [elapsed, setElapsed] = useState(now.elapsed ?? 0);
  const [artworkFailed, setArtworkFailed] = useState(false);

  /*
   * The position has to run locally. The streamer's status only changes when something
   * actually happens — a track change, play, pause — so it does not report each passing
   * second; a long-poll can sit for a minute with the position quietly advancing.
   */
  useEffect(() => {
    setElapsed(now.elapsed ?? 0);
  }, [now.elapsed, now.title]);

  useEffect(() => {
    if (now.state !== 'playing') return;
    const timer = setInterval(() => {
      setElapsed((current) => (now.duration ? Math.min(current + 1, now.duration) : current + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [now.state, now.duration]);

  useEffect(() => setArtworkFailed(false), [now.image]);

  const playing = now.state === 'playing';
  const loading = now.state === 'loading';
  const fraction = now.duration ? Math.min(elapsed / now.duration, 1) : 0;

  const send = (action: PlayerAction) => {
    void playerAction(action).catch(() => {
      // The streamer's own status is the truth; it will correct us either way.
    });
  };

  return (
    <section className={`${styles.player} ${loading ? styles.loading : ''}`} aria-label="Now playing">
      <div className={styles.top}>
      {now.image && !artworkFailed ? (
        <img
          className={styles.art}
          src={now.image}
          alt=""
          onError={() => setArtworkFailed(true)}
        />
      ) : (
        <div className={`${styles.art} ${styles.artFallback}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M9 18V5l10-2v13" />
            <circle cx="6.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="16" r="2.5" />
          </svg>
        </div>
      )}

      <div className={styles.text}>
        <span className={styles.title}>{now.title ?? 'Unknown track'}</span>
        <span className={styles.artist}>{now.artist ?? now.service ?? ''}</span>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.skip}
          disabled={offline}
          aria-label="Previous track"
          onClick={() => send('previous')}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path d="M7 6h2.2v12H7zM20 6v12l-9.2-6z" />
          </svg>
        </button>

        <button
          type="button"
          className={styles.play}
          disabled={offline}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => send(playing ? 'pause' : 'play')}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M8 5h3.1v14H8zM12.9 5H16v14h-3.1z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M8.5 5l11 7-11 7z" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className={styles.skip}
          disabled={offline}
          aria-label="Next track"
          onClick={() => send('next')}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            <path d="M14.8 6H17v12h-2.2zM4 6l9.2 6L4 18z" />
          </svg>
        </button>
      </div>

      </div>

      <div className={styles.progressRow}>
        <span className={styles.time}>{clock(elapsed)}</span>
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
    </section>
  );
}
