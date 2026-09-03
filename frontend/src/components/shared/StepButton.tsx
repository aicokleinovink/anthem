import styles from './StepButton.module.css';

interface StepButtonProps {
  direction: 'up' | 'down';
  /**
   * What this press does, spoken. Required rather than derived from the direction: the
   * same pair of buttons steps the receiver's volume on one card and the TV's brightness
   * on another, and "Volume up" on the picture card would simply be wrong.
   */
  label: string;
  disabled: boolean;
  onPress: () => void;
}

export function StepButton({ direction, label, disabled, onPress }: StepButtonProps) {
  return (
    <button
      className={styles.step}
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
        {direction === 'up' && <line x1="12" y1="5" x2="12" y2="19" />}
      </svg>
    </button>
  );
}
