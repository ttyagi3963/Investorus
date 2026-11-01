// The typed REST client base (T264): JSON in and out, and every non-2xx answer as an ApiError that
// carries the api's code and the fields it named, so forms can show each error on its field. The
// browser points it at the BFF (`/bff`), so browser code never handles the session token. Every
// POST, PUT, and PATCH carries an Idempotency-Key (T285): a fresh one per call, or the caller's,
// so the retries of one action share a key.

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];
  readonly details: Record<string, unknown>;
  /** The request's trace ID, which a user can quote to support (T283, T300). */
  readonly requestId: string | null;

  constructor(
    status: number,
    body: {
      error?: string;
      code?: string;
      details?: Record<string, unknown>;
      requestId?: string;
    },
  ) {
    super(body.error ?? `Request failed (${status})`);
    this.name = new.target.name;
    this.status = status;
    this.code = body.code ?? "UNKNOWN";
    this.requestId = body.requestId ?? null;
    this.details = body.details ?? {};
    this.fields = Array.isArray(this.details.fields) ? (this.details.fields as FieldError[]) : [];
  }
}

export type RequestOptions = { idempotencyKey?: string };

export type ApiClient = {
  request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T>;
};

const KEYED_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** 128 random bits as hex; Web Crypto, which browsers also offer on plain-HTTP pages. */
const newIdempotencyKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

/** The api's `{ error, code, details }`, or nothing when a failed answer is not JSON (an outage). */
function errorBody(text: string): ConstructorParameters<typeof ApiError>[1] {
  try {
    return text ? (JSON.parse(text) as ConstructorParameters<typeof ApiError>[1]) : {};
  } catch {
    return {};
  }
}

export function createApiClient(options: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}): ApiClient {
  const send = options.fetch ?? globalThis.fetch;
  return {
    async request<T>(
      method: string,
      path: string,
      body?: unknown,
      { idempotencyKey }: RequestOptions = {},
    ): Promise<T> {
      const headers: Record<string, string> = {};
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (KEYED_METHODS.has(method))
        headers["Idempotency-Key"] = idempotencyKey ?? newIdempotencyKey();
      const res = await send(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new ApiError(res.status, errorBody(text));
      return (text ? JSON.parse(text) : undefined) as T;
    },
  };
}
