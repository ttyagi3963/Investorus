// The typed REST client base (T264): JSON in and out, and every non-2xx answer as an ApiError that
// carries the api's code and the fields it named, so forms can show each error on its field. The
// browser points it at the BFF (`/bff`), so browser code never handles the session token.

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    body: { error?: string; code?: string; details?: Record<string, unknown> },
  ) {
    super(body.error ?? `Request failed (${status})`);
    this.name = new.target.name;
    this.status = status;
    this.code = body.code ?? "UNKNOWN";
    this.details = body.details ?? {};
    this.fields = Array.isArray(this.details.fields) ? (this.details.fields as FieldError[]) : [];
  }
}

export type ApiClient = {
  request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T>;
};

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
    async request<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await send(`${options.baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new ApiError(res.status, errorBody(text));
      return (text ? JSON.parse(text) : undefined) as T;
    },
  };
}
