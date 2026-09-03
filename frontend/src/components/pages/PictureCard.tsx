import { Card } from '../shared/Card';
import { StepButton } from '../shared/StepButton';
import { VolumeDial } from '../shared/VolumeDial';
import { useRipples } from '../../hooks/useRipples';
import type { BacklightController } from '../../hooks/useBacklight';
import styles from './PictureCard.module.css';

/**
 * How far one press moves the brightness. Ten points is what the setting is worth
 * changing by — the menu it replaces is deep enough that nobody goes there to nudge it
 * by one.
 */
const STEP = 10;

interface PictureCardProps {
  /** Owned by the app, not by this card — see InputsCard. */
  controller: BacklightController;
  offline: boolean;
}

/**
 * OLED pixel brightness, on the same dial the volume uses.
 *
 * It is the one TV setting worth a card of its own: it is buried several menus deep on
 * the set and it gets changed daily. The value is a real percentage — 0-100 is the
 * scale the TV itself uses — so the dial reads it straight, with no conversion.
 *
 * The set is the authority. A press sends a *step* rather than a level, and presses
 * coalesce on the way out — see `useBacklight`, which exists because the shared
 * optimistic write drops anything sent while a write is already in flight.
 */
export function PictureCard({ controller, offline }: PictureCardProps) {
  const { available, value: backlight, step } = controller;
  const { ripples, spawn } = useRipples();

  const ready = backlight !== null;
  const locked = offline || !available || !ready;

  const press = (steps: number) => {
    spawn(steps > 0 ? 'up' : 'down');
    step(steps);
  };

  return (
    <Card
      title="Picture"
      /*
       * The third state here is not "off": a set that is on but whose client key predates
       * the settings permissions cannot report a value at all, and saying "Unavailable"
       * is honest about the difference. Re-pairing is what fixes it.
       */
      status={offline ? 'Offline' : !available ? 'Off' : ready ? 'OLED pixel brightness' : 'Unavailable'}
      statusStrong={offline || !available || !ready}
      dimmed={locked}
    >
      <VolumeDial
        fraction={ready ? backlight / 100 : 0}
        label={ready ? `${backlight}` : '––'}
        caption={ready ? 'brightness' : 'not reported'}
        dimmed={locked}
        ripples={ripples}
      />

      <div className={styles.controls}>
        <StepButton
          direction="down"
          label="Dimmer"
          disabled={locked || backlight === 0}
          onPress={() => press(-STEP)}
        />
        <StepButton
          direction="up"
          label="Brighter"
          disabled={locked || backlight === 100}
          onPress={() => press(STEP)}
        />
      </div>
    </Card>
  );
}
