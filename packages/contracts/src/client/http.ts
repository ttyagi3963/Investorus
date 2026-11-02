// The typed REST client base (T264): JSON in and out, and every non-2xx answer as an ApiError that
// carries the api's code and the fields it named, so forms can show each error on its field. The
// browser points it at the BFF (`/bff`), so browser code never handles the session token. Every
// POST, PUT, and PATCH carries an Idempotency-Key (T285), kept with the request until the api
// settles it (T381), so a retried or double-clicked action is applied once whoever calls it.

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

export type ApiClient = {
  request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T>;
};

const KEYED_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** 409s about the key itself: the first request still runs, or it ran and its answer was lost. */
const KEY_NOT_SETTLED = new Set(["IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_ALREADY_APPLIED"]);

/**
 * Whether the api settled the request, so sending it again is a new action with a new key: it
 * answered, below 500, and not about the key. A lost answer (no ApiError), a 5xx, or a 409 about
 * the key keeps it, so the retry is a replay and the change never runs twice. A refusal is stored
 * under its key, so keeping the key after one would replay the refusal even once its cause is gone.
 */
const settled = (err: unknown) =>
  err instanceof ApiError && err.status < 500 && !KEY_NOT_SETTLED.has(err.code);

/** A request's key until it is settled, and its answer while it is in flight. */
type Unsettled = { key: string; answer?: Promise<unknown> };

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

/**
 * A request is the same action as an unsettled one when its method, path, and body match, which is
 * what the api compares under a key: a changed body is a new action with a new key, never a 422 for
 * reusing one. The memory belongs to this client, so one client serves one user (the browser's; the
 * server makes one per call).
 */
export function createApiClient(options: {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
}): ApiClient {
  const send = options.fetch ?? globalThis.fetch;
  const unsettled = new Map<string, Unsettled>();

  async function call<T>(method: string, path: string, payload?: string, key?: string) {
    const headers: Record<string, string> = {};
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (key) headers["Idempotency-Key"] = key;
    const res = await send(`${options.baseUrl}${path}`, { method, headers, body: payload });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, errorBody(text));
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      if (!KEYED_METHODS.has(method)) return call<T>(method, path, payload);
      const action = `${method} ${path} ${payload ?? ""}`;
      const pending = unsettled.get(action) ?? { key: newIdempotencyKey() };
      // Sent again before its answer arrived (a double-click): it shares the first one's answer.
      if (pending.answer) return pending.answer as Promise<T>;
      unsettled.set(action, pending);
      pending.answer = call<T>(method, path, payload, pending.key).then(
        (value) => {
          unsettled.delete(action);
          return value;
        },
        (err: unknown) => {
          if (settled(err)) unsettled.delete(action);
          else pending.answer = undefined;
          throw err;
        },
      );
      return pending.answer as Promise<T>;
    },
  };
}
