import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/** The two shapes the player takes, measured from the slots it has to land in. */
interface Slot {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Morph {
  /** 0 = the strip below the card, 1 = filling the card slot. Fractional while dragging. */
  progress: number;
  /** True only while a finger is on it, when the geometry must not be transitioned. */
  dragging: boolean;
  /** Inline geometry for the player surface, interpolated between the two slots. */
  frame: { top: number; left: number; width: number; height: number } | null;
  /** Starts a drag-to-collapse from the expanded state. */
  onDragStart: (event: React.PointerEvent) => void;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** Past this much of the way back up, releasing settles open again rather than closing. */
const SETTLE_AT = 0.62;
/** A flick downwards closes regardless of how far it actually travelled, in px/ms. */
const FLICK_VELOCITY = 0.55;

/**
 * Drives the player between the strip below the card and the card slot itself.
 *
 * The two states are different sizes in different places, so this measures both slots and
 * interpolates the surface between them. Everything is expressed as one `progress` number
 * so the *same* geometry can be driven two ways: by a CSS transition when it is opening or
 * closing on its own, and by a finger when it is being dragged down. A view transition
 * would have been far less code, but it plays start-to-finish on its own — it cannot be
 * scrubbed, which is exactly what dragging to collapse needs.
 *
 * Nothing here animates in JavaScript. The frame is written as an inline style, and CSS
 * transitions it whenever a drag is not in progress, so the browser still owns the easing.
 */
export function usePlayerMorph(
  expanded: boolean,
  onCollapse: () => void,
  refs: {
    shell: RefObject<HTMLDivElement | null>;
    stage: RefObject<HTMLDivElement | null>;
    strip: RefObject<HTMLDivElement | null>;
  },
): Morph {
  const [slots, setSlots] = useState<{ open: Slot; shut: Slot } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const measure = useCallback(() => {
    const shell = refs.shell.current;
    const stage = refs.stage.current;
    const strip = refs.strip.current;
    if (!shell || !stage || !strip) return;

    // Relative to the shell, because that is what the player is positioned inside.
    const origin = shell.getBoundingClientRect();
    const toSlot = (element: HTMLElement): Slot => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top - origin.top,
        left: rect.left - origin.left,
        width: rect.width,
        height: rect.height,
      };
    };

    setSlots({ open: toSlot(stage), shut: toSlot(strip) });
  }, [refs.shell, refs.stage, refs.strip]);

  // Before paint, so the player never shows up at the wrong size for a frame.
  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    const shell = refs.shell.current;
    if (!shell) return;
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [measure, refs.shell]);

  const onDragStart = useCallback(
    (event: React.PointerEvent) => {
      if (!expanded || !slots) return;

      const travel = slots.shut.top - slots.open.top;
      // Nothing to drag along if the two slots happen to coincide.
      if (travel <= 0) return;

      const startY = event.clientY;
      const startedAt = event.timeStamp;
      setDrag(1);

      // Listeners live for the length of the gesture rather than in an effect, so a drag
      // does not re-subscribe on every move.
      const move = (moved: PointerEvent) => {
        // Downwards only: dragging up past the open position would stretch it past the card.
        const dy = Math.max(0, moved.clientY - startY);
        setDrag(Math.max(0, 1 - dy / travel));
      };

      const release = (ended: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        setDrag(null);

        const dy = ended.clientY - startY;
        const velocity = dy / Math.max(1, ended.timeStamp - startedAt);
        const remaining = Math.max(0, 1 - dy / travel);

        // Either it was dragged most of the way down, or it was flicked.
        if (remaining < SETTLE_AT || velocity > FLICK_VELOCITY) onCollapse();
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    },
    [expanded, slots, onCollapse],
  );

  const progress = drag ?? (expanded ? 1 : 0);

  const frame = slots && {
    top: lerp(slots.shut.top, slots.open.top, progress),
    left: lerp(slots.shut.left, slots.open.left, progress),
    width: lerp(slots.shut.width, slots.open.width, progress),
    height: lerp(slots.shut.height, slots.open.height, progress),
  };

  return {
    progress,
    dragging: drag !== null,
    frame: frame ?? null,
    onDragStart,
  };
}
