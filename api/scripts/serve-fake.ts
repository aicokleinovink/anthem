import type { Socket } from 'node:net';
import express from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { Receiver } from '../src/device/receiver.js';
import { AnthemConnection } from '../src/transport/connection.js';
import { startFakeReceiver } from '../test/fakes/receiver.js';
import { FakePlayer } from '../test/fakes/player.js';
import { FakeTv } from '../test/fakes/tv.js';

/**
 * The whole app, on one port, against fake devices — what the Playwright suite drives.
 *
 * The mocking happens at the *device* layer, not in the browser: `createApp` already
 * takes its three clients as arguments, so the routes, the event stream and the whole
 * protocol translation run for real. Intercepting `/api/*` in the page would leave
 * exactly the seam where things break untested.
 *
 * A second HTTP server on its own port lets the tests read what the fakes were sent and
 * push changes at them. It is deliberately not mounted on the app: nothing under test
 * should have a test-only route in it.
 */

const controlPort = Number(process.env.FAKE_CONTROL_PORT ?? 3101);

const fake = await startFakeReceiver();

// The receiver's address is only known once the fake is listening, so it is passed to
// the connection directly rather than through ANTHEM_HOST/ANTHEM_PORT — the config is
// already frozen by the time we have a port.
const receiver = new Receiver(new AnthemConnection('127.0.0.1', fake.port));
receiver.start();

const player = new FakePlayer();
const tv = new FakeTv();

const server = createApp(receiver, player, tv).listen(config.httpPort, () => {
  console.log(`[fake] app on http://localhost:${config.httpPort}`);
  console.log(`[fake] receiver on 127.0.0.1:${fake.port}`);
});

/**
 * Open connections, so stopping the app can drop them. Closing an HTTP server only
 * stops it accepting new ones — an event stream already in flight would stay open, and
 * the UI would never notice the service had gone.
 */
const sockets = new Set<Socket>();
server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});

const control = express();
control.use(express.json());

/** Everything the fakes have been asked to do since the last reset. */
control.get('/log', (_req, res) => {
  res.json({
    receiver: fake.received,
    tv: tv.selections,
    tvKeys: tv.keys,
    tvBacklights: tv.backlights,
    player: player.actions,
  });
});

control.post('/log/reset', (_req, res) => {
  fake.clear();
  tv.selections.length = 0;
  player.actions.length = 0;
  tv.keys.length = 0;
  tv.backlights.length = 0;
  res.json({ ok: true });
});

/** What the receiver reports right now, for asserting a write actually landed. */
control.get('/receiver', (_req, res) => {
  res.json(fake.state);
});

/** Push unsolicited frames, as the front panel or another remote would. */
control.post('/push', (req, res) => {
  const { frames } = req.body as { frames: string[] };
  fake.push(...frames);
  res.json({ ok: true });
});

/**
 * Take the app away and bring it back, so the UI's own reconnection can be tested.
 * The fakes and the receiver connection are untouched: only the HTTP listener cycles,
 * which is what a service restart behind a proxy looks like from the browser.
 */
control.post('/app/stop', (_req, res) => {
  if (server.listening) server.close();
  for (const socket of sockets) socket.destroy();
  res.json({ ok: true });
});

control.post('/app/start', (_req, res) => {
  if (server.listening) return void res.json({ ok: true });
  server.listen(config.httpPort, () => res.json({ ok: true }));
});

control.post('/player', (req, res) => {
  player.set((req.body as { now: Parameters<FakePlayer['set']>[0] }).now);
  res.json({ ok: true });
});

control.post('/tv', (req, res) => {
  const { available, current } = req.body as { available: boolean; current: string | null };
  tv.set(available, current);
  res.json({ ok: true });
});

const controlServer = control.listen(controlPort, () => {
  console.log(`[fake] control on http://localhost:${controlPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    receiver.stop();
    void fake.close();
    server.close();
    controlServer.close(() => process.exit(0));
  });
}
