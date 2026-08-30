import { Card } from '../shared/Card';
import { Panel } from '../shared/Panel';
import { PillList } from '../shared/PillList';

interface TvController {
  available: boolean;
  current: string | null;
  targets: Array<{ key: string; label: string }>;
  select: (target: string) => void;
}

interface TvCardProps {
  controller: TvController;
  offline: boolean;
}

export function TvCard({ controller, offline }: TvCardProps) {
  const { available, current, targets, select } = controller;
  const locked = offline || !available;

  const currentLabel = targets.find((target) => target.key === current)?.label;

  return (
    <Card
      title="TV"
      // The set cannot be woken over the network, so "Off" is the end of the story here.
      status={offline ? 'Offline' : available ? (currentLabel ?? 'On') : 'Off'}
      statusStrong={offline || !available}
      dimmed={locked}
    >
      <Panel title="Watch">
        <PillList
          items={targets.map((target) => ({ key: target.key, label: target.label }))}
          selected={current}
          disabled={locked}
          align="top"
          compact
          emptyLabel="No sources configured"
          onSelect={(key) => select(String(key))}
        />
      </Panel>
    </Card>
  );
}
