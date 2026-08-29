import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
  onSelect: (key: number | string) => void;
}

/**
 * A vertical list whose selection is a single pill that slides between rows — the
 * toolbar's selected-tab pill, turned on its side. Shared by the inputs list and the
 * speaker-profile picker so both navigations feel like the same idea.
 */
export function PillList({
  items,
  selected,
  disabled,
  align = 'center',
  compact,
  onSelect,
}: PillListProps) {
  const list = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ y: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const container = list.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>('.picker__row--active');
      setPill(active ? { y: active.offsetTop, height: active.offsetHeight } : null);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selected, items.length]);

  return (
    <div
      className={`picker ${align === 'top' ? 'picker--top' : ''} ${compact ? 'picker--compact' : ''} ${
        disabled ? 'picker--disabled' : ''
      }`}
      ref={list}
    >
      <span
        className={`picker__pill ${pill ? 'picker__pill--ready' : ''}`}
        style={pill ? { transform: `translateY(${pill.y}px)`, height: pill.height } : undefined}
        aria-hidden="true"
      />

      {items.map((item) => {
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            type="button"
            className={`picker__row ${active ? 'picker__row--active' : ''}`}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(item.key)}
          >
            <span className="picker__label">{item.label}</span>
            {active && item.trailing}
          </button>
        );
      })}
    </div>
  );
}
