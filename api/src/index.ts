import { config } from './config.js';
import { Receiver } from './device/receiver.js';
import { Player } from './player/player.js';
import { WebosTv } from './tv/webos.js';
import { createApp } from './app.js';

const receiver = new Receiver();
receiver.start();

const player = new Player();
player.start();

const tv = new WebosTv();
tv.start();

const server = createApp(receiver, player, tv).listen(config.httpPort, () => {
  console.log(`[anthem] API on http://localhost:${config.httpPort}`);
  console.log(`[anthem] receiver at ${config.host}:${config.port}, max volume ${config.maxVolumeDb} dB`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    receiver.stop();
    player.stop();
    tv.stop();
    server.close(() => process.exit(0));
  });
}
