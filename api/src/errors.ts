/** The receiver is unreachable, or did not answer in time. */
export class DeviceOfflineError extends Error {
  readonly code = 'device_offline';
  readonly status = 503;
}

/** The receiver answered, but rejected the command. */
export class DeviceCommandError extends Error {
  readonly code = 'device_command_error';
  readonly status = 502;

  constructor(
    message: string,
    readonly command: string,
  ) {
    super(message);
  }
}

/** The request itself was malformed. */
export class BadRequestError extends Error {
  readonly code = 'bad_request';
  readonly status = 400;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
