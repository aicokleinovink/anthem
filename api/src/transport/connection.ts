import { EventEmitter } from 'node:events';
import net from 'node:net';
import { config } from '../config.js';
import { DeviceCommandError, DeviceOfflineError } from '../errors.js';
import { parseMessage, splitFrames, type Message } from '../protocol/parse.js';

interface PendingCommand {
  command: string;
  matches: (message: Message) => boolean;
  resolve: (message: Message) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Minimum gap between writes. The receiver silently DROPS commands that arrive
 * back-to-back: a burst of `Z1VOL?;Z1MUT?;Z1VDN;Z1VDN;Z1VUP;Z1VUP;` was answered as
 * if only the first three had been sent. Pacing writes is what makes multi-command
 * operations (a volume step of N, the post-connect refresh) reliable.
 */
const MIN_COMMAND_GAP_MS = 75;

/**
 * A single long-lived TCP connection to the receiver.
 *
 * The receiver pushes unsolicited status whenever something changes at the front panel
 * or on the remote, so we hold the socket open and emit every frame as a `message`
 * event. Commands are written one at a time and correlated with the next matching
 * frame, which is enough because the receiver answers in order.
 */
export class AnthemConnection extends EventEmitter {
  #socket?: net.Socket;
  #buffer = '';
  #queue: PendingCommand[] = [];
  #inFlight?: PendingCommand;
  #reconnectDelay = RECONNECT_MIN_MS;
  #reconnectTimer?: NodeJS.Timeout;
  #pumpTimer?: NodeJS.Timeout;
  #lastWriteAt = 0;
  #closed = false;

  connected = false;

  constructor(
    private readonly host: string = config.host,
    private readonly port: number = config.port,
  ) {
    super();
  }

  connect(): void {
    this.#closed = false;
    if (this.#socket) return;

    const socket = net.createConnection({ host: this.host, port: this.port });
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    this.#socket = socket;

    socket.on('connect', () => {
      this.connected = true;
      this.#reconnectDelay = RECONNECT_MIN_MS;
      this.emit('connected');
      this.#pump();
    });

    socket.on('data', (chunk: string) => this.#onData(chunk));
    socket.on('error', (error: Error) => this.emit('socketError', error));
    socket.on('close', () => this.#onClose());
  }

  /** Stop reconnecting and drop the socket. */
  close(): void {
    this.#closed = true;
    clearTimeout(this.#reconnectTimer);
    clearTimeout(this.#pumpTimer);
    this.#pumpTimer = undefined;
    this.#socket?.destroy();
    this.#socket = undefined;
    this.connected = false;
    this.#failAll(new DeviceOfflineError('Connection closed'));
  }

  /**
   * Send a command and resolve with the first reply frame that `matches`.
   * Commands are queued, so callers never have to serialise themselves.
   */
  send(command: string, matches: (message: Message) => boolean): Promise<Message> {
    return new Promise<Message>((resolve, reject) => {
      this.#queue.push({ command, matches, resolve, reject });
      this.#pump();
    });
  }

  /** Send without waiting for a reply. */
  sendRaw(command: string): void {
    if (!this.connected || !this.#socket) {
      throw new DeviceOfflineError(`Receiver at ${this.host}:${this.port} is not connected`);
    }
    this.#socket.write(command);
  }

  /**
   * Send the next queued command, never sooner than MIN_COMMAND_GAP_MS after the last
   * write. Always deferred to a later tick, so replies arriving batched in one TCP
   * chunk cannot cause the next command to be written mid-chunk.
   */
  #pump(): void {
    if (this.#inFlight || this.#pumpTimer || this.#queue.length === 0) return;
    if (!this.connected || !this.#socket) {
      // Nothing can go out until we reconnect; fail fast rather than queueing forever.
      this.#failAll(new DeviceOfflineError(`Receiver at ${this.host}:${this.port} is not connected`));
      return;
    }

    const wait = Math.max(0, MIN_COMMAND_GAP_MS - (Date.now() - this.#lastWriteAt));
    this.#pumpTimer = setTimeout(() => {
      this.#pumpTimer = undefined;
      this.#write();
    }, wait);
  }

  #write(): void {
    if (this.#inFlight || this.#queue.length === 0) return;
    if (!this.connected || !this.#socket) {
      this.#failAll(new DeviceOfflineError(`Receiver at ${this.host}:${this.port} is not connected`));
      return;
    }

    const pending = this.#queue.shift()!;
    this.#inFlight = pending;
    pending.timer = setTimeout(() => {
      this.#inFlight = undefined;
      pending.reject(new DeviceOfflineError(`Timed out waiting for reply to "${pending.command}"`));
      this.#pump();
    }, config.commandTimeoutMs);

    this.#lastWriteAt = Date.now();
    this.#socket.write(pending.command);
  }

  #onData(chunk: string): void {
    const { frames, rest } = splitFrames(this.#buffer + chunk);
    this.#buffer = rest;

    for (const frame of frames) {
      const message = parseMessage(frame);
      // Every frame updates the state cache, whether we asked for it or not.
      this.emit('message', message);

      const pending = this.#inFlight;
      if (!pending) continue;

      if (message.kind === 'error') {
        this.#settle(pending, () =>
          pending.reject(
            new DeviceCommandError(`Receiver rejected "${pending.command}"`, pending.command),
          ),
        );
        continue;
      }

      if (pending.matches(message)) {
        this.#settle(pending, () => pending.resolve(message));
      }
    }
  }

  #settle(pending: PendingCommand, action: () => void): void {
    clearTimeout(pending.timer);
    this.#inFlight = undefined;
    action();
    this.#pump();
  }

  #onClose(): void {
    this.connected = false;
    this.#socket = undefined;
    this.#buffer = '';
    this.#failAll(new DeviceOfflineError('Connection to the receiver was lost'));
    this.emit('disconnected');
    if (this.#closed) return;

    this.#reconnectTimer = setTimeout(() => this.connect(), this.#reconnectDelay);
    this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  #failAll(error: Error): void {
    const pending = this.#inFlight ? [this.#inFlight, ...this.#queue] : [...this.#queue];
    this.#inFlight = undefined;
    this.#queue = [];
    for (const item of pending) {
      clearTimeout(item.timer);
      item.reject(error);
    }
  }
}
