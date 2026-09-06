import { Card } from '../shared/Card';
import { Panel } from '../shared/Panel';
import { SourceTiles } from '../shared/SourceTiles';
import { iconForTvTarget } from '../shared/sourceIcons';
import type { TvController } from '../../hooks/useTvTargets';

interface TvCardProps {
  /** Owned by the app, not by this card — see InputsCard. */
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
        <SourceTiles
          items={targets.map((target) => ({
            key: target.key,
            label: target.label,
            icon: iconForTvTarget(target.key),
          }))}
          selected={current}
          disabled={locked}
          emptyLabel="No sources configured"
          onSelect={(key) => select(String(key))}
        />
      </Panel>
    </Card>
  );
}
