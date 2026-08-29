import { Card } from '../components/Card';
import { PillList } from '../components/PillList';
import type { DisplayController } from '../hooks/useDisplay';
import type { SpeakerProfilesController } from '../hooks/useSpeakerProfiles';

interface SettingsCardProps {
  profiles: SpeakerProfilesController;
  display: DisplayController;
  powerOn: boolean | null;
  offline: boolean;
}

export function SettingsCard({ profiles, display, powerOn, offline }: SettingsCardProps) {
  const standby = powerOn === false;
  const locked = standby || offline;

  return (
    <Card
      title="Settings"
      // The header already names the input, which is what the speaker profile applies to.
      status={standby ? 'Standby' : offline ? 'Offline' : (profiles.inputName ?? 'Anthem MRX 540')}
      statusStrong={standby || offline}
      dimmed={locked}
    >
      {/* Each setting sits in its own thin-outlined panel, so two lists in one card
          read as two separate things rather than one long stack of rows. */}
      <section className="panel">
        <h2 className="panel__title">Speaker Profile</h2>
        <PillList
          items={profiles.profiles.map((profile) => ({
            key: profile.value,
            label: profile.name,
          }))}
          selected={profiles.selected}
          disabled={locked || profiles.profiles.length === 0}
          align="top"
          compact
          onSelect={(value) => profiles.select(Number(value))}
        />
      </section>

      <section className="panel">
        <h2 className="panel__title">Display</h2>
        <PillList
          items={display.options.map((option) => ({ key: option.value, label: option.label }))}
          selected={display.info}
          disabled={locked || display.options.length === 0}
          align="top"
          compact
          onSelect={(value) => display.select(Number(value))}
        />
      </section>
    </Card>
  );
}
