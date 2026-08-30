import { DEVICES, DEVICE_LABELS, type Device } from './Toolbar';
import styles from './DeviceSwitcher.module.css';

interface DeviceSwitcherProps {
  device: Device;
  onSelect: (device: Device) => void;
}

/**
 * Chooses which device's controls the toolbar below is offering. It is deliberately
 * plain — no surface of its own, no pill — so it reads as a heading over the section
 * tabs rather than as a second set of them.
 */
export function DeviceSwitcher({ device, onSelect }: DeviceSwitcherProps) {
  return (
    <nav className={styles.switcher} aria-label="Device">
      {DEVICES.map((name, index) => (
        <span key={name} className={styles.slot}>
          {index > 0 && (
            <span className={styles.separator} aria-hidden="true">
              ·
            </span>
          )}
          <button
            type="button"
            aria-pressed={name === device}
            className={`${styles.device} ${name === device ? styles.deviceActive : ''}`}
            onClick={() => onSelect(name)}
          >
            {DEVICE_LABELS[name]}
          </button>
        </span>
      ))}
    </nav>
  );
}
