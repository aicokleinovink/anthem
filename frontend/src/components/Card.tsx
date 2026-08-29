import type { ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  title: string;
  /** Small right-aligned line in the header: the receiver name, "Standby", "Offline". */
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
