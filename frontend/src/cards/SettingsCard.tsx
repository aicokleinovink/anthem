import { Card } from '../components/Card';
import { Panel } from '../components/Panel';
import { PillList } from '../components/PillList';
interface SpeakerProfilesController {
  profiles: Array<{ profile: number; value: number; name: string }>;
  selected: number | null;
  inputName: string | null;
  select: (value: number) => void;
}

interface DisplayController {
  options: Array<{ value: number; label: string }>;
  info: number | null;
  select: (info: number) => void;
}

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
      <Panel title="Speaker Profile">
        <PillList
          items={profiles.profiles.map((profile) => ({
            key: profile.value,
            label: profile.name,
          }))}
          selected={profiles.selected}
          disabled={locked}
          align="top"
          compact
          emptyLabel="Reading profiles…"
          onSelect={(value) => profiles.select(Number(value))}
        />
      </Panel>

      <Panel title="Display">
        <PillList
          items={display.options.map((option) => ({ key: option.value, label: option.label }))}
          selected={display.info}
          disabled={locked}
          align="top"
          compact
          emptyLabel="Reading settings…"
          onSelect={(value) => display.select(Number(value))}
        />
      </Panel>
    </Card>
  );
}
