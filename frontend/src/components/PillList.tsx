import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
  const list = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const container = list.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(`.${styles.rowActive}`);
      setPill(active ? { y: active.offsetTop, height: active.offsetHeight } : null);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selected, items.length]);

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
    <div className={className} ref={list}>
      <span
        className={`${styles.pill} ${pill ? styles.pillReady : ''}`}
        style={pill ? { transform: `translateY(${pill.y}px)`, height: pill.height } : undefined}
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
