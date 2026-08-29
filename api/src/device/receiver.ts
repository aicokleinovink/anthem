import { EventEmitter } from 'node:events';
import { config } from '../config.js';
import { DeviceOfflineError } from '../errors.js';
import { commands, type Zone } from '../protocol/commands.js';
import type { Message } from '../protocol/parse.js';
import { AnthemConnection } from '../transport/connection.js';
import { applyMessage, emptyState, type ReceiverState, type ZoneState } from './state.js';
import { clampDb, dbToPercent, percentToDb } from './volume.js';

/** The receiver has four speaker-profile slots, named or not. */
const PROFILE_SLOTS = 4;

const zoneReply = (zone: Zone, key: string) => (message: Message) =>
  message.kind === 'zone' && message.zone === zone && message.key === key;

const globalReply = (key: string) => (message: Message) =>
  message.kind === 'global' && message.key === key;

/**
 * High-level view of the receiver: issue a command, get back the state the device
 * actually confirmed. Nothing here echoes the request.
 */
export class Receiver extends EventEmitter {
  readonly state: ReceiverState = emptyState();

  /** Set while a 'changed' emit is already scheduled. */
  #pendingChange?: NodeJS.Timeout;

  constructor(private readonly connection = new AnthemConnection()) {
    super();

    this.connection.on('message', (message: Message) => {
      applyMessage(this.state, message);
      this.#announce();
    });
    this.connection.on('connected', () => {
      this.state.connected = true;
      this.#announce();
      void this.refresh();
    });
    this.connection.on('disconnected', () => {
      this.state.connected = false;
      this.#announce();
    });
    this.connection.on('socketError', (error: Error) => {
      // Reconnection is handled by the transport; surface the reason and carry on.
      console.error(`[anthem] socket error: ${error.message}`);
    });
  }

  /**
   * Tell listeners the state moved, at most once per window. A single volume change
   * arrives as two frames (PVOL then VOL); coalescing keeps that one event.
   */
  #announce(): void {
    if (this.#pendingChange) return;
    this.#pendingChange = setTimeout(() => {
      this.#pendingChange = undefined;
      this.emit('changed');
    }, 30);
  }

  start(): void {
    this.connection.connect();
  }

  stop(): void {
    this.connection.close();
  }

  /**
   * Read everything once after a (re)connect. From then on the receiver pushes its own
   * changes, so this is the only place the full picture is pulled — it is what lets
   * clients stop polling entirely.
   */
  async refresh(): Promise<void> {
    try {
      await this.connection.send(commands.model(), globalReply('IDM'));
      await this.connection.send(commands.software(), globalReply('IDS'));
      await this.connection.send(commands.region(), globalReply('IDR'));

      for (const zone of [1, 2] as const) {
        await this.getPower(zone);
        await this.getVolume(zone);
      }

      await this.listInputs();
      const input = await this.getInput(1);
      await this.getAudioFormat(1);

      await this.listProfiles();
      if (input !== undefined) await this.getInputProfile(input);

      await this.getFrontPanelInfo();
    } catch (error) {
      console.error(`[anthem] refresh failed: ${(error as Error).message}`);
    }
  }

  // --- power -------------------------------------------------------------

  async getPower(zone: Zone): Promise<boolean> {
    const message = await this.connection.send(commands.powerQuery(zone), zoneReply(zone, 'POW'));
    applyMessage(this.state, message);
    return this.state.zones[zone].power ?? false;
  }

  async setPower(zone: Zone, on: boolean): Promise<boolean> {
    const message = await this.connection.send(commands.power(zone, on), zoneReply(zone, 'POW'));
    applyMessage(this.state, message);
    return this.state.zones[zone].power ?? on;
  }

  async togglePower(zone: Zone): Promise<boolean> {
    return this.setPower(zone, !(await this.getPower(zone)));
  }

  // --- volume ------------------------------------------------------------

  async getVolume(zone: Zone): Promise<Required<Pick<ZoneState, 'volumeDb'>> & ZoneState> {
    const db = await this.connection.send(commands.volumeDbQuery(zone), zoneReply(zone, 'VOL'));
    applyMessage(this.state, db);
    const mute = await this.connection.send(commands.muteQuery(zone), zoneReply(zone, 'MUT'));
    applyMessage(this.state, mute);

    const zoneState = this.state.zones[zone];
    const volumeDb = zoneState.volumeDb ?? config.minVolumeDb;
    zoneState.volumePercent = dbToPercent(volumeDb);
    return { ...zoneState, volumeDb };
  }

  /**
   * Set volume in dB, clamped to the configured safe range.
   *
   * Written via `Z1PVOL` rather than `Z1VOL` — see the note in protocol/commands.ts:
   * `Z1VOL` as a setter does not land on the value you give it. Percent and dB are the
   * same scale here, so this costs no precision beyond 1 dB.
   */
  async setVolumeDb(zone: Zone, db: number): Promise<number> {
    const target = clampDb(db);
    const message = await this.connection.send(
      commands.volumePercent(zone, dbToPercent(target)),
      zoneReply(zone, 'VOL'),
    );
    applyMessage(this.state, message);
    return this.state.zones[zone].volumeDb ?? target;
  }

  /** Set volume as a percentage. Clamped through the same dB ceiling. */
  async setVolumePercent(zone: Zone, percent: number): Promise<number> {
    return this.setVolumeDb(zone, percentToDb(percent));
  }

  /**
   * Relative change, 1 dB per step. Positive goes up, negative down.
   *
   * The receiver's VUP/VDN take no argument, so N steps means N commands; they are
   * queued back-to-back on the one socket. The safety ceiling is enforced per step,
   * so a long step-up stops at the ceiling instead of walking past it.
   */
  async stepVolume(zone: Zone, steps: number): Promise<number> {
    let current = (await this.getVolume(zone)).volumeDb;

    for (let i = 0; i < Math.abs(steps); i += 1) {
      if (steps > 0 && current >= config.maxVolumeDb) break;
      if (steps < 0 && current <= config.minVolumeDb) break;

      const command = steps > 0 ? commands.volumeUp(zone) : commands.volumeDown(zone);
      const message = await this.connection.send(command, zoneReply(zone, 'VOL'));
      applyMessage(this.state, message);
      current = this.state.zones[zone].volumeDb ?? current;
    }

    return current;
  }

  async setMute(zone: Zone, muted: boolean): Promise<boolean> {
    const message = await this.connection.send(commands.mute(zone, muted), zoneReply(zone, 'MUT'));
    applyMessage(this.state, message);
    return this.state.zones[zone].muted ?? muted;
  }

  async toggleMute(zone: Zone): Promise<boolean> {
    const message = await this.connection.send(commands.muteToggle(zone), zoneReply(zone, 'MUT'));
    applyMessage(this.state, message);
    return this.state.zones[zone].muted ?? false;
  }

  // --- inputs ------------------------------------------------------------

  async getInput(zone: Zone): Promise<number | undefined> {
    const message = await this.connection.send(commands.inputQuery(zone), zoneReply(zone, 'INP'));
    applyMessage(this.state, message);
    return this.state.zones[zone].input;
  }

  async setInput(zone: Zone, input: number): Promise<number | undefined> {
    const message = await this.connection.send(
      commands.input(zone, input),
      zoneReply(zone, 'INP'),
    );
    applyMessage(this.state, message);
    return this.state.zones[zone].input;
  }

  async getAudioFormat(zone: Zone): Promise<string | undefined> {
    const message = await this.connection.send(
      commands.audioFormatQuery(zone),
      zoneReply(zone, 'AIN'),
    );
    applyMessage(this.state, message);
    return this.state.zones[zone].audioFormat;
  }

  /**
   * Input numbers and their names. Names are read once and cached — they only change
   * when someone renames an input in the receiver's setup, and fetching them costs one
   * paced command each.
   */
  async listInputs(): Promise<Array<{ input: number; name: string }>> {
    if (this.state.inputCount === undefined) {
      const count = await this.connection.send(commands.inputCount(), globalReply('ICN'));
      applyMessage(this.state, count);
    }

    const total = this.state.inputCount ?? 0;
    for (let input = 1; input <= total; input += 1) {
      if (this.state.inputNames[input] !== undefined) continue;
      const name = await this.connection.send(
        commands.inputNameQuery(input),
        (message) => message.kind === 'inputName' && message.input === input,
      );
      applyMessage(this.state, name);
    }

    return Array.from({ length: total }, (_unused, index) => ({
      input: index + 1,
      name: this.state.inputNames[index + 1] ?? `Input ${index + 1}`,
    }));
  }

  // --- speaker profiles ---------------------------------------------------

  /**
   * The receiver's four speaker-profile slots and their names. Names are cached like
   * input names — they change only when someone renames a profile in setup.
   */
  async listProfiles(): Promise<Array<{ profile: number; value: number; name: string }>> {
    for (let profile = 1; profile <= PROFILE_SLOTS; profile += 1) {
      if (this.state.profileNames[profile] !== undefined) continue;
      const name = await this.connection.send(
        commands.profileNameQuery(profile),
        (message) => message.kind === 'profileName' && message.profile === profile,
      );
      applyMessage(this.state, name);
    }

    return Array.from({ length: PROFILE_SLOTS }, (_unused, index) => ({
      profile: index + 1,
      // What the wire expects: 0 selects profile 1.
      value: index,
      name: this.state.profileNames[index + 1] ?? `Profile${index + 1}`,
    }));
  }

  async getInputProfile(input: number): Promise<number | undefined> {
    const message = await this.connection.send(
      commands.inputProfileQuery(input),
      (reply) => reply.kind === 'inputProfile' && reply.input === input,
    );
    applyMessage(this.state, message);
    return this.state.inputProfiles[input];
  }

  async setInputProfile(input: number, value: number): Promise<number | undefined> {
    const message = await this.connection.send(
      commands.inputProfile(input, value),
      (reply) => reply.kind === 'inputProfile' && reply.input === input,
    );
    applyMessage(this.state, message);
    return this.state.inputProfiles[input];
  }

  // --- front panel --------------------------------------------------------

  async getFrontPanelInfo(): Promise<number | undefined> {
    const message = await this.connection.send(
      commands.frontPanelInfoQuery(),
      globalReply('GCFPDI'),
    );
    applyMessage(this.state, message);
    return this.state.frontPanelInfo;
  }

  async setFrontPanelInfo(value: number): Promise<number | undefined> {
    const message = await this.connection.send(
      commands.frontPanelInfo(value),
      globalReply('GCFPDI'),
    );
    applyMessage(this.state, message);
    return this.state.frontPanelInfo;
  }

  // --- system ------------------------------------------------------------

  async identity(): Promise<{ connected: boolean; model?: string; software?: string }> {
    if (!this.connection.connected) {
      throw new DeviceOfflineError(`Receiver at ${config.host}:${config.port} is not connected`);
    }
    const model = await this.connection.send(commands.model(), globalReply('IDM'));
    applyMessage(this.state, model);
    return { connected: true, model: this.state.model, software: this.state.software };
  }
}
