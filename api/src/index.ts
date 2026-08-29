import { config } from './config.js';
import { Receiver } from './device/receiver.js';
import { createApp } from './app.js';

const receiver = new Receiver();
receiver.start();

const server = createApp(receiver).listen(config.httpPort, () => {
  console.log(`[anthem] API on http://localhost:${config.httpPort}`);
  console.log(`[anthem] receiver at ${config.host}:${config.port}, max volume ${config.maxVolumeDb} dB`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    receiver.stop();
    server.close(() => process.exit(0));
  });
}
