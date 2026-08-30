import type { Ripple } from '../../hooks/useRipples';
import styles from './VolumeDial.module.css';

const SIZE = 268;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** 270° of arc, leaving a 90° gap at the bottom — the watch-face look. */
const SWEEP = 0.75;
const START_ANGLE = 135;

interface VolumeDialProps {
  /** 0-1 of the receiver's full range. */
  fraction: number;
  label: string;
  caption: string;
  dimmed: boolean;
  ripples: Ripple[];
}

export function VolumeDial({ fraction, label, caption, dimmed, ripples }: VolumeDialProps) {
  const filled = Math.min(Math.max(fraction, 0), 1) * SWEEP * CIRCUMFERENCE;
  // A round cap on a zero-length dash still paints a dot, so drop the arc entirely
  // when there is nothing to show.
  const hasArc = filled > 0.5;

  return (
    <div className={`${styles.dial} ${dimmed ? styles.dimmed : ''}`}>
      <div className={styles.ripples} aria-hidden="true">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className={`${styles.ripple} ${ripple.direction === 'up' ? styles.up : styles.down}`}
          >
            <span className={styles.ring} />
            <span className={`${styles.ring} ${styles.trail}`} />
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <g transform={`rotate(${START_ANGLE} ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            className={styles.track}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={`${SWEEP * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          />
          {hasArc && (
            <circle
              className={styles.progress}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              strokeWidth={STROKE}
              strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            />
          )}
        </g>
      </svg>

      <div className={styles.readout}>
        {/* Keyed on the value so the pop animation replays on every change. */}
        <span className={styles.value} key={label}>
          {label}
        </span>
        <span className={styles.caption}>{caption}</span>
      </div>
    </div>
  );
}
