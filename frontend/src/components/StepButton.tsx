import styles from './StepButton.module.css';

interface StepButtonProps {
  direction: 'up' | 'down';
  disabled: boolean;
  onPress: () => void;
}

export function StepButton({ direction, disabled, onPress }: StepButtonProps) {
  return (
    <button
      className={styles.step}
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-label={direction === 'up' ? 'Volume up' : 'Volume down'}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
        {direction === 'up' && <line x1="12" y1="5" x2="12" y2="19" />}
      </svg>
    </button>
  );
}
