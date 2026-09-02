import type { CSSProperties } from 'react';
import { Card } from '../shared/Card';
import { Panel } from '../shared/Panel';
import type { SoundControl, SoundController } from '../../hooks/useSound';
import styles from './SoundCard.module.css';

interface SoundCardProps {
  /** Owned by the app, not by this card — see InputsCard. */
  controller: SoundController;
  /** From the toolbar's power control, so a receiver in standby says so. */
  powerOn: boolean | null;
  /** App-wide: nothing can reach the receiver, so every control is disabled. */
  offline: boolean;
}

/**
 * A trim reads as an offset from flat, so it always carries its sign — and a true minus
 * rather than a hyphen, to match the widths either side of it.
 */
function reading(db: number): string {
  if (db === 0) return '0.0 dB';
  return `${db > 0 ? '+' : '−'}${Math.abs(db).toFixed(1)} dB`;
}

export function SoundCard({ controller, powerOn, offline }: SoundCardProps) {
  const { controls, minDb, maxDb, stepDb, set } = controller;
  const standby = powerOn === false;
  const locked = standby || offline;

  return (
    <Card
      title="Sound"
      status={standby ? 'Standby' : offline ? 'Offline' : undefined}
      statusStrong={standby || offline}
      dimmed={locked}
    >
      {controls.map((control) => (
        <Panel key={control.key} title={control.label}>
          <Row
            control={control}
            minDb={minDb}
            maxDb={maxDb}
            stepDb={stepDb}
            disabled={locked}
            onChange={(db) => set(control.key, db)}
          />
        </Panel>
      ))}
    </Card>
  );
}

interface RowProps {
  control: SoundControl;
  minDb: number;
  maxDb: number;
  stepDb: number;
  disabled: boolean;
  onChange: (db: number) => void;
}

function Row({ control, minDb, maxDb, stepDb, disabled, onChange }: RowProps) {
  const ready = control.db !== null;
  const db = control.db ?? 0;

  // These are offsets from flat, so the fill runs from the centre out to the thumb
  // rather than from the left — at 0 dB there is nothing to fill, which is the point.
  const position = ((db - minDb) / (maxDb - minDb)) * 100;
  const zero = ((0 - minDb) / (maxDb - minDb)) * 100;

  return (
    <div className={styles.row}>
      <span className={styles.value}>{ready ? reading(db) : '––'}</span>
      <input
        type="range"
        className={styles.range}
        min={minDb}
        max={maxDb}
        step={stepDb}
        value={db}
        disabled={disabled || !ready}
        aria-label={control.label}
        aria-valuetext={ready ? `${reading(db)}` : undefined}
        style={
          {
            '--from': `${Math.min(zero, position)}%`,
            '--to': `${Math.max(zero, position)}%`,
          } as CSSProperties
        }
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
