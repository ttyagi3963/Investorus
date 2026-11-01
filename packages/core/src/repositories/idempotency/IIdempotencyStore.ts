// The idempotency key store port (T285; constitution XX.2): the api's idempotency middleware claims
// a user's key before a POST or PATCH runs, then stores its answer, or frees the key after a 5xx.
// Any store failure is an InfrastructureError, so the middleware can fail closed.

/** What identifies one request under a key: a retry must send the same method, path, and body. */
export type IdempotencyRequest = {
  userId: string;
  key: string;
  method: string;
  path: string;
  bodyHash: string;
};

export type IdempotencyClaim =
  | { kind: "claimed" }
  /** `body` is the JSON text first sent, or null for an empty answer. */
  | { kind: "replay"; status: number; body: string | null }
  | { kind: "in-progress" }
  | { kind: "mismatch" };

export interface IIdempotencyStore {
  /** Claims the key, or says why not: a stored answer, a request still running, or another body. */
  claim(request: IdempotencyRequest): Promise<IdempotencyClaim>;
  /** Stores the answer (its JSON text, or null when empty) of the request that claimed the key. */
  complete(userId: string, key: string, status: number, body: string | null): Promise<void>;
  /** Frees a claimed key after a 5xx, so a retry runs the change again. */
  release(userId: string, key: string): Promise<void>;
}
