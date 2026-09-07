import type { ReactNode } from 'react';
import styles from './SourceTiles.module.css';

export interface SourceTile {
  key: number | string;
  label: string;
  /** URL of the mask SVG for this source — see `sourceIcons.ts`. */
  icon: string;
  /** Optional corner content, e.g. the signal bars on the playing source. */
  trailing?: ReactNode;
}

interface SourceTilesProps {
  items: SourceTile[];
  selected: number | string | null;
  disabled?: boolean;
  /** Shown in place of the grid while there is nothing to list yet. */
  emptyLabel?: string;
  onSelect: (key: number | string) => void;
}

/**
 * A grid of glassy tiles, one per source, for the two cards that pick a *destination*
 * rather than a setting. A pill list reads as a settings list; a destination wants a
 * face, so each source gets an icon and a tile of its own.
 *
 * `PillList` stays for the settings pickers — this sits beside it rather than replacing
 * it.
 */
export function SourceTiles({
  items,
  selected,
  disabled,
  emptyLabel = 'Nothing to show',
  onSelect,
}: SourceTilesProps) {
  const className = `${styles.tiles} ${disabled ? styles.disabled : ''}`;

  if (items.length === 0) {
    return (
      <div className={className}>
        <div className={styles.empty}>{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item) => {
        const active = item.key === selected;
        return (
          <button
            key={item.key}
            type="button"
            className={`${styles.tile} ${active ? styles.tileActive : ''}`}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onSelect(item.key)}
          >
            {active && item.trailing && <span className={styles.trailing}>{item.trailing}</span>}
            <span
              className={styles.icon}
              /*
               * The mask is per tile, so it is the one thing that cannot live in the
               * stylesheet; everything about how it is drawn still does.
               *
               * Quoted, and it has to be: Vite inlines these SVGs as data URIs that
               * contain single quotes of their own, and an unquoted url() containing one
               * is invalid CSS — the browser drops the whole declaration and the tile
               * renders a blank square.
               */
              style={{ maskImage: `url("${item.icon}")`, WebkitMaskImage: `url("${item.icon}")` }}
              aria-hidden="true"
            />
            <span className={styles.label}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
