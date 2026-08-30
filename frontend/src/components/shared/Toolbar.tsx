import { useSlidingPill } from '../../hooks/useSlidingPill';
import { PowerButton } from './PowerButton';
import styles from './Toolbar.module.css';

export const SECTIONS = ['volume', 'inputs', 'tv', 'settings'] as const;

export type Section = (typeof SECTIONS)[number];

/** The card below the toolbar is the panel these tabs control. */
export const SECTION_PANEL_ID = 'section-panel';

const LABELS: Record<Section, string> = {
  volume: 'Volume',
  inputs: 'Inputs',
  tv: 'TV',
  settings: 'Settings',
};

interface ToolbarProps {
  section: Section;
  onSelect: (section: Section) => void;
  power: boolean | null;
  powerBusy: boolean;
  offline: boolean;
  onTogglePower: () => void;
}

export function Toolbar({
  section,
  onSelect,
  power,
  powerBusy,
  offline,
  onTogglePower,
}: ToolbarProps) {
  // One pill that slides between tabs, rather than a background on each tab, so the
  // move can be animated. Label widths differ, so it is measured from the active tab.
  const { ref, pill, animated } = useSlidingPill('x', styles.tabActive, [section]);

  return (
    <nav className={styles.toolbar} aria-label="Receiver controls">
      <div className={styles.tabs} role="tablist" ref={ref}>
        {/* Hidden until measured, and only animated after that: on load it appears at
            the right tab rather than sliding in from the left. */}
        <span
          className={`${styles.pill} ${pill ? styles.visible : ''} ${animated ? styles.animated : ''}`}
          style={pill ? { transform: `translateX(${pill.start}px)`, width: pill.size } : undefined}
          aria-hidden="true"
        />

        {SECTIONS.map((name) => (
          <button
            key={name}
            id={`tab-${name}`}
            type="button"
            role="tab"
            aria-selected={name === section}
            aria-controls={SECTION_PANEL_ID}
            className={`${styles.tab} ${name === section ? styles.tabActive : ''}`}
            onClick={() => onSelect(name)}
          >
            {LABELS[name]}
          </button>
        ))}
      </div>

      {/* The tabs stay live when offline: they are navigation, not receiver controls. */}
      <PowerButton on={power} busy={powerBusy} offline={offline} onToggle={onTogglePower} />
    </nav>
  );
}
