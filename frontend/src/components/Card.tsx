import type { ReactNode } from 'react';

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
    <section className={`card ${dimmed ? 'card--dimmed' : ''}`}>
      <header className="card__header">
        <span className="card__title">{title}</span>
        {status && (
          <span className={`card__status ${statusStrong ? 'card__status--strong' : ''}`}>
            {status}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}
