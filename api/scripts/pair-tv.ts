/**
 * Pair with the LG television, once.
 *
 * Turn the set on and run `npm run pair-tv`. It will show a prompt; accept it with the
 * remote and this prints a client key to put in .env as TV_CLIENT_KEY. Later connections
 * present that key and pair silently.
 *
 *   npm run pair-tv                 # uses TV_HOST from .env
 *   npm run pair-tv -- 192.168.2.6  # or name the set explicitly
 */
import { config } from '../src/config.js';
import { TV_MANIFEST } from '../src/tv/manifest.js';

const host = process.argv[2] ?? config.tvHost;

if (!host) {
  console.error('No TV address. Pass one, or set TV_HOST in .env.');
  process.exit(1);
}


console.log(`connecting to ${host} — accept the prompt on the TV`);

const socket = new WebSocket(`ws://${host}:3000`);

socket.onopen = () => {
  socket.send(
    JSON.stringify({
      type: 'register',
      id: 'register',
      payload: { forcePairing: false, pairingType: 'PROMPT', manifest: TV_MANIFEST },
    }),
  );
};

socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data)) as {
    type: string;
    payload?: Record<string, unknown>;
    error?: string;
  };

  if (message.type === 'registered') {
    console.log(`\nTV_CLIENT_KEY=${String(message.payload?.['client-key'])}\n`);
    console.log('Put that in api/.env, alongside TV_HOST.');
    process.exit(0);
  }

  if (message.type === 'error') {
    console.error(`the TV refused: ${message.error}`);
    process.exit(1);
  }
};

socket.onerror = () => {
  console.error('could not reach the TV — is it switched on?');
  process.exit(1);
};

setTimeout(() => {
  console.error('no answer; the prompt may not have been accepted');
  process.exit(1);
}, 60_000);
