import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { test } from 'node:test';
import { AnthemConnection } from '../src/transport/connection.js';
import type { Message } from '../src/protocol/parse.js';

/** A stand-in receiver: answers queries, and can push unsolicited frames. */
async function fakeReceiver(handler: (command: string, socket: net.Socket) => void) {
  const sockets: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      for (const frame of chunk.split(';').filter(Boolean)) handler(`${frame};`, socket);
    });
    socket.on('error', () => {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as net.AddressInfo;
  return {
    port,
    sockets,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const echo = (command: string, socket: net.Socket) => {
  if (command === 'Z1POW?;') socket.write('Z1POW1;');
  else if (command === 'Z1VOL?;') socket.write('Z1VOL-81.0;');
  else socket.write('!' + command);
};

test('correlates a reply with the command that asked for it', async () => {
  const server = await fakeReceiver(echo);
  const connection = new AnthemConnection('127.0.0.1', server.port);
  connection.connect();
  await once(connection, 'connected');

  const reply = await connection.send('Z1POW?;', (m) => m.kind === 'zone' && m.key === 'POW');
  assert.deepEqual(reply, { kind: 'zone', zone: 1, key: 'POW', value: '1' });

  connection.close();
  await server.close();
});

test('queued commands are sent one at a time and resolve in order', async () => {
  const server = await fakeReceiver(echo);
  const connection = new AnthemConnection('127.0.0.1', server.port);
  connection.connect();
  await once(connection, 'connected');

  const [power, volume] = await Promise.all([
    connection.send('Z1POW?;', (m) => m.kind === 'zone' && m.key === 'POW'),
    connection.send('Z1VOL?;', (m) => m.kind === 'zone' && m.key === 'VOL'),
  ]);
  assert.equal(power.kind === 'zone' && power.value, '1');
  assert.equal(volume.kind === 'zone' && volume.value, '-81.0');

  connection.close();
  await server.close();
});

test('a rejected command rejects the promise', async () => {
  const server = await fakeReceiver(echo);
  const connection = new AnthemConnection('127.0.0.1', server.port);
  connection.connect();
  await once(connection, 'connected');

  await assert.rejects(() => connection.send('Z9BAD?;', () => true), /rejected/);

  connection.close();
  await server.close();
});

test('unsolicited pushes are emitted as messages', async () => {
  const server = await fakeReceiver((command, socket) => {
    echo(command, socket);
    // Someone reached for the remote right after we asked.
    if (command === 'Z1POW?;') socket.write('Z1VOL-70.5;');
  });
  const connection = new AnthemConnection('127.0.0.1', server.port);
  const seen: Message[] = [];
  connection.on('message', (m: Message) => seen.push(m));
  connection.connect();
  await once(connection, 'connected');

  await connection.send('Z1POW?;', (m) => m.kind === 'zone' && m.key === 'POW');
  await once(connection, 'message'); // the pushed VOL frame

  assert.ok(seen.some((m) => m.kind === 'zone' && m.key === 'VOL' && m.value === '-70.5'));

  connection.close();
  await server.close();
});

test('in-flight commands fail when the receiver drops the connection', async () => {
  const server = await fakeReceiver((_command, socket) => socket.destroy());
  const connection = new AnthemConnection('127.0.0.1', server.port);
  connection.connect();
  await once(connection, 'connected');

  await assert.rejects(() => connection.send('Z1POW?;', () => true), /lost/);
  assert.equal(connection.connected, false);

  connection.close();
  await server.close();
});
