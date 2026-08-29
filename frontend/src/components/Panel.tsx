import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title: string;
  children: ReactNode;
}

/** One setting and its options, in a thin-outlined container inside a card. */
export function Panel({ title, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  );
}
