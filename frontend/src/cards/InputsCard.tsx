import { Card } from '../components/Card';
import { PillList } from '../components/PillList';
import { SignalBars } from '../components/SignalBars';
import type { InputsController } from '../hooks/useInputs';

interface InputsCardProps {
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
      <section className="panel">
        <h2 className="panel__title">Select Input</h2>

        {inputs.length === 0 ? (
          <div className="card__empty">Reading inputs…</div>
        ) : (
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
            onSelect={(key) => select(Number(key))}
          />
        )}
      </section>
    </Card>
  );
}
