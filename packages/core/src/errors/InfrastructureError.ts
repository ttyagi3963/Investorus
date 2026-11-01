// A platform failure (a database, storage, or outside service that did not answer), thrown by
// adapters instead of raw SDK errors (constitution IV, VII). The cause is kept for the log only.

export class InfrastructureError extends Error {
  readonly status: 502 | 503;
  readonly #cause: unknown;

  constructor(message: string, status: 502 | 503 = 503, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.#cause = cause;
  }

  /** The underlying error, for the error reporter; never part of a response. */
  get underlyingCause(): unknown {
    return this.#cause;
  }
}
