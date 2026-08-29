/**
 * Replay the phase-1 command map against the real receiver and print each reply.
 * Read-only: it only sends queries, so it is safe to run at any time.
 *
 *   npm run probe
 */
import { config } from '../src/config.js';
import { commands } from '../src/protocol/commands.js';
import { AnthemConnection } from '../src/transport/connection.js';

const QUERIES: Array<[string, string]> = [
  ['model', commands.model()],
  ['software', commands.software()],
  ['region', commands.region()],
  ['input count', commands.inputCount()],
  ['zone 1 power', commands.powerQuery(1)],
  ['zone 1 volume dB', commands.volumeDbQuery(1)],
  ['zone 1 volume %', commands.volumePercentQuery(1)],
  ['zone 1 mute', commands.muteQuery(1)],
  ['zone 2 power', commands.powerQuery(2)],
];

const connection = new AnthemConnection();

connection.on('socketError', (error: Error) => {
  console.error(`connection failed: ${error.message}`);
  process.exitCode = 1;
});

connection.on('connected', async () => {
  console.log(`connected to ${config.host}:${config.port}\n`);

  for (const [label, command] of QUERIES) {
    try {
      const reply = await connection.send(command, () => true);
      console.log(`${label.padEnd(18)} ${command.padEnd(12)} -> ${JSON.stringify(reply)}`);
    } catch (error) {
      console.log(`${label.padEnd(18)} ${command.padEnd(12)} !! ${(error as Error).message}`);
      process.exitCode = 1;
    }
  }

  connection.close();
  process.exit(process.exitCode ?? 0);
});

connection.connect();
