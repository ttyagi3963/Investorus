// The idempotency key store port (T285, T367; constitution XX.2): the api's idempotency middleware
// claims a user's key before a POST or PATCH runs, then stores its answer, or frees the key after a
// 5xx. A claim is a lease with a token, so a claim abandoned by a crashed process can be taken over
// when nothing committed, and is reported as already applied when something did. The worker purges
// keys past their retention (T390). Any store failure is an InfrastructureError, so the middleware
// can fail closed.

/** What identifies one request under a key: a retry must send the same method, path, and body. */
export type IdempotencyRequest = {
  userId: string;
  key: string;
  method: string;
  path: string;
  bodyHash: string;
};

export type IdempotencyClaim =
  /** `token` names this claim; only its holder can complete, release, or commit under it. */
  | { kind: "claimed"; token: string }
  /** `body` is the JSON text first sent, or null for an empty answer. */
  | { kind: "replay"; status: number; body: string | null }
  | { kind: "in-progress" }
  /** The request committed its change, but its process died before storing the answer. */
  | { kind: "applied" }
  | { kind: "mismatch" };

export interface IIdempotencyStore {
  /** Claims the key, or says why not: a stored answer, a request still running, or another body. */
  claim(request: IdempotencyRequest): Promise<IdempotencyClaim>;
  /** Stores the answer (its JSON text, or null when empty) of the request that claimed the key. */
  complete(
    userId: string,
    key: string,
    token: string,
    status: number,
    body: string | null,
  ): Promise<void>;
  /** After a 5xx: frees the key if nothing committed, so a retry runs the change again. */
  release(userId: string, key: string, token: string): Promise<void>;
  /** Deletes a batch of keys past their 24 hours, with their stored answers; returns how many. */
  purgeExpired(): Promise<number>;
}
