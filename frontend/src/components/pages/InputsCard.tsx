import { Card } from '../shared/Card';
import { Panel } from '../shared/Panel';
import { PillList } from '../shared/PillList';
import { SignalBars } from '../shared/SignalBars';
import type { InputsController } from '../../hooks/useInputs';

interface InputsCardProps {
  /**
   * Owned by the app, not by this card — switching tabs unmounts the card, and state
   * living here would reset on every visit.
   */
  controller: InputsController;
  powerOn: boolean | null;
  offline: boolean;
}

export function InputsCard({ controller, powerOn, offline }: InputsCardProps) {
  const { inputs, selected, format, select } = controller;

  const standby = powerOn === false;
  const locked = standby || offline || inputs.length === 0;
  const live = format !== null && format !== 'No Signal';

  return (
    <Card
      title="Inputs"
      status={standby ? 'Standby' : offline ? 'Offline' : (format ?? 'Anthem MRX 540')}
      statusStrong={standby || offline}
      dimmed={locked}
    >
      {/* Same outlined panel as the settings card, so the two read as one system. */}
      <Panel title="Select Input">
        <PillList
          items={inputs.map((option) => ({
            key: option.input,
            label: option.name,
            // Only the playing source gets bars, and only while a signal is arriving.
            trailing: live ? <SignalBars /> : undefined,
          }))}
          selected={selected}
          disabled={locked}
          align="top"
          compact
          emptyLabel="Reading inputs…"
          onSelect={(key) => select(Number(key))}
        />
      </Panel>
    </Card>
  );
}
