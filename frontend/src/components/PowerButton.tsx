import styles from './PowerButton.module.css';

interface PowerButtonProps {
  /** null while the first state is still being fetched. */
  on: boolean | null;
  busy: boolean;
  /** Nothing can reach the receiver, so pressing this could not do anything. */
  offline: boolean;
  onToggle: () => void;
}

export function PowerButton({ on, busy, offline, onToggle }: PowerButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.power} ${on ? styles.on : ''}`}
      disabled={on === null || busy || offline}
      aria-pressed={on ?? false}
      aria-label={on ? 'Turn receiver off' : 'Turn receiver on'}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <path d="M12 3.6v7.2" />
        <path d="M7.05 6.7a7 7 0 1 0 9.9 0" />
      </svg>
    </button>
  );
}
