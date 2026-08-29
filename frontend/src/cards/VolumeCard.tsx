import { MAX_DB, MIN_DB } from '../api';
import { Card } from '../components/Card';
import { StepButton } from '../components/StepButton';
import { VolumeDial } from '../components/VolumeDial';
import { useRipples } from '../hooks/useRipples';
import type { VolumeController } from '../hooks/useVolume';

interface VolumeCardProps {
  /**
   * Owned by the app, not by this card. Switching tabs unmounts the card, and a hook
   * living here would reset to "connecting" and re-fetch every time you came back.
   */
  controller: VolumeController;
  /** From the toolbar's power control, so a receiver in standby says so. */
  powerOn: boolean | null;
  /** App-wide: nothing can reach the receiver, so every control is disabled. */
  offline: boolean;
}

export function VolumeCard({ controller, powerOn, offline }: VolumeCardProps) {
  const { volume, displayDb, step } = controller;
  const { ripples, spawn } = useRipples();

  const press = (steps: number) => {
    spawn(steps > 0 ? 'up' : 'down');
    step(steps);
  };

  // The dial shows the receiver's full scale: 0% at -90 dB, 100% at +10 dB, so the number
  // here is the number the receiver itself reports. How loud it will actually go is the
  // receiver's Maximum Volume setting, not something this app second-guesses.
  const fraction = displayDb === null ? 0 : (displayDb - MIN_DB) / (MAX_DB - MIN_DB);
  const ready = displayDb !== null;

  // The API only clamps if MAX_VOLUME_DB is set; by default this is the top of the scale.
  const ceilingDb = volume?.maxDb ?? MAX_DB;
  const standby = powerOn === false;
  const locked = !ready || offline || standby;
  // Someone can mute from the remote, and the level alone would not show it.
  const muted = volume?.muted ?? false;

  return (
    <Card
      title="Volume"
      status={standby ? 'Standby' : offline ? 'Offline' : 'Anthem MRX 540'}
      statusStrong={standby || offline}
      dimmed={locked}
    >
      <VolumeDial
        fraction={fraction}
        label={ready ? `${Math.round(fraction * 100)}%` : '––'}
        caption={ready ? `${displayDb.toFixed(0)} dB${muted ? ' · muted' : ''}` : 'connecting'}
        dimmed={locked || muted}
        ripples={ripples}
      />

      <div className="controls">
        <StepButton
          direction="down"
          disabled={locked || displayDb === null || displayDb <= MIN_DB}
          onPress={() => press(-1)}
        />
        <StepButton
          direction="up"
          disabled={locked || displayDb === null || displayDb >= ceilingDb}
          onPress={() => press(1)}
        />
      </div>
    </Card>
  );
}
