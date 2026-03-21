/** Partner integration misconfiguration (missing URL, etc.). */
export class IntegrationMisconfiguredError extends Error {
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "IntegrationMisconfiguredError";
  }
}

/** Upstream partner HTTP failure or invalid response. */
export class IntegrationUpstreamError extends Error {
  readonly statusCode = 502;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "IntegrationUpstreamError";
  }
}
