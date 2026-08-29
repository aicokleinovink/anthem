import { useLayoutEffect, useRef, useState } from 'react';
import { PowerButton } from './PowerButton';

export const SECTIONS = ['volume', 'inputs', 'settings'] as const;

/** The card below the toolbar is the panel these tabs control. */
export const SECTION_PANEL_ID = 'section-panel';

export type Section = (typeof SECTIONS)[number];

const LABELS: Record<Section, string> = {
  volume: 'Volume',
  inputs: 'Inputs',
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
  const tabs = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

  /*
   * The selected pill is one element that slides between tabs rather than a background
   * on each tab, so the move can be animated. Its position is measured from the active
   * tab: label widths differ, and a ResizeObserver keeps it right when the layout changes.
   */
  useLayoutEffect(() => {
    const container = tabs.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>('.tab--active');
      if (active) setPill({ x: active.offsetLeft, width: active.offsetWidth });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [section]);

  return (
    <nav className="toolbar" aria-label="Receiver controls">
      <div className="toolbar__tabs" role="tablist" ref={tabs}>
        {/* Hidden until measured, so it fades in at the right tab instead of sliding in from the left. */}
        <span
          className={`tab__pill ${pill ? 'tab__pill--ready' : ''}`}
          style={pill ? { transform: `translateX(${pill.x}px)`, width: pill.width } : undefined}
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
            className={`tab ${name === section ? 'tab--active' : ''}`}
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
