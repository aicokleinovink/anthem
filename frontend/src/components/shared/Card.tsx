import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  /**
   * Small right-aligned line in the header. One meaning only: a live fact about whatever
   * this card controls — the arriving signal format, the input a profile applies to, what
   * the TV is watching — or the state that overrides it, "Standby" or "Offline".
   *
   * Left out when there is no such fact, rather than filled with a label. It used to fall
   * back to "Anthem MRX 540", which put two different kinds of thing in one slot on one
   * card: Inputs read "2.0 PCM" until the format was unknown and then named the device.
   * The device switcher above already says which device this is.
   */
  status?: string;
  /** Draw the status in full ink rather than grey — for states that need noticing. */
  statusStrong?: boolean;
  dimmed?: boolean;
  children?: ReactNode;
}

/** The shared surface every control section sits on. */
export function Card({ title, status, statusStrong, dimmed, children }: CardProps) {
  return (
    <section className={`${styles.card} ${dimmed ? styles.dimmed : ''}`}>
      <header className={styles.header}>
        <span className={styles.title}>{title}</span>
        {status && (
          <span className={`${styles.status} ${statusStrong ? styles.statusStrong : ''}`}>
            {status}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
