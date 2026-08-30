import { useSlidingPill } from '../../hooks/useSlidingPill';
import { PowerButton } from './PowerButton';
import styles from './Toolbar.module.css';

export const DEVICES = ['tv', 'anthem'] as const;

export type Device = (typeof DEVICES)[number];

const ALL_SECTIONS = ['volume', 'inputs', 'settings'] as const;

export type Section = (typeof ALL_SECTIONS)[number];

/**
 * The sections each device offers. `inputs` appears under both on purpose and means
 * that device's own sources — the TV's watch targets, or the receiver's inputs.
 */
export const SECTIONS: Record<Device, readonly [Section, ...Section[]]> = {
  tv: ['inputs'],
  anthem: ['volume', 'inputs', 'settings'],
};

/** The card below the toolbar is the panel these tabs control. */
export const SECTION_PANEL_ID = 'section-panel';

export const DEVICE_LABELS: Record<Device, string> = {
  tv: 'TV',
  anthem: 'Anthem',
};

const LABELS: Record<Section, string> = {
  volume: 'Volume',
  inputs: 'Inputs',
  settings: 'Settings',
};

interface ToolbarProps {
  device: Device;
  section: Section;
  onSelect: (section: Section) => void;
  power: boolean | null;
  powerBusy: boolean;
  offline: boolean;
  onTogglePower: () => void;
}

export function Toolbar({
  device,
  section,
  onSelect,
  power,
  powerBusy,
  offline,
  onTogglePower,
}: ToolbarProps) {
  const sections = SECTIONS[device];
  // A lone tab has nowhere to slide to, and a pill that never moves reads as broken,
  // so it gets a plain background instead and the sliding one is not measured at all.
  const sliding = sections.length > 1;

  // One pill that slides between tabs, rather than a background on each tab, so the
  // move can be animated. Label widths differ, so it is measured from the active tab.
  const { ref, pill, animated } = useSlidingPill(
    'x',
    sliding ? styles.tabActive : undefined,
    [device, section],
  );

  return (
    <nav className={styles.toolbar} aria-label={`${DEVICE_LABELS[device]} controls`}>
      <div className={styles.tabs} role="tablist" ref={ref}>
        {/* Hidden until measured, and only animated after that: on load it appears at
            the right tab rather than sliding in from the left. */}
        {sliding && (
          <span
            className={`${styles.pill} ${pill ? styles.visible : ''} ${animated ? styles.animated : ''}`}
            style={pill ? { transform: `translateX(${pill.start}px)`, width: pill.size } : undefined}
            aria-hidden="true"
          />
        )}

        {sections.map((name) => (
          <button
            key={name}
            id={`tab-${name}`}
            type="button"
            role="tab"
            aria-selected={name === section}
            aria-controls={SECTION_PANEL_ID}
            className={`${styles.tab} ${name === section ? styles.tabActive : ''} ${
              name === section && !sliding ? styles.tabSolo : ''
            }`}
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
