import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  /** Sits opposite the title on the same line — a current value the title names. */
  trailing?: ReactNode;
  children: ReactNode;
}

/** One setting and its options, in a thin-outlined container inside a card. */
export function Panel({ title, trailing, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        {trailing}
      </header>
      {children}
    </section>
  );
}
