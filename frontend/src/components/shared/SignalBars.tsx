import styles from './SignalBars.module.css';

/**
 * Three moving bars on the selected source. Rendered only while a signal is actually
 * arriving — as a static trio they read as an ellipsis rather than as an indicator.
 */
export function SignalBars() {
  return (
    <span className={styles.bars} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}
