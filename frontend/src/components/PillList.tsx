import type { ReactNode } from 'react';
import { useSlidingPill } from '../hooks/useSlidingPill';
import styles from './PillList.module.css';

export interface PillItem {
  key: number | string;
  label: string;
  /** Optional right-hand content, e.g. the signal bars on the playing source. */
  trailing?: ReactNode;
}

interface PillListProps {
  items: PillItem[];
  selected: number | string | null;
  disabled?: boolean;
  /** Short lists read better under their section heading than floating mid-card. */
  align?: 'center' | 'top';
  /** Shorter rows, for cards that stack more than one list. */
  compact?: boolean;
  /** Shown in place of the rows while there is nothing to list yet. */
  emptyLabel?: string;
  onSelect: (key: number | string) => void;
}

/**
 * A vertical list whose selection is a single pill that slides between rows — the
 * toolbar's selected-tab pill, turned on its side. Shared by the inputs list and the
 * settings pickers so every selection in the app behaves the same way.
 */
export function PillList({
  items,
  selected,
  disabled,
  align = 'center',
  compact,
  emptyLabel = 'Nothing to show',
  onSelect,
}: PillListProps) {
  const { ref, pill, animated } = useSlidingPill('y', styles.rowActive, [selected, items.length]);

  const className = [
    styles.picker,
    align === 'top' ? styles.top : '',
    compact ? styles.compact : '',
    disabled ? styles.disabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (items.length === 0) {
    return (
      <div className={className}>
        <div className={styles.empty}>{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div className={className} ref={ref}>
      <span
        className={`${styles.pill} ${pill ? styles.visible : ''} ${animated ? styles.animated : ''}`}
        style={pill ? { transform: `translateY(${pill.start}px)`, height: pill.size } : undefined}
        aria-hidden="true"
      />

      {items.map((item) => {
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            type="button"
            className={`${styles.row} ${active ? styles.rowActive : ''}`}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(item.key)}
          >
            <span className={styles.label}>{item.label}</span>
            {active && item.trailing}
          </button>
        );
      })}
    </div>
  );
}
