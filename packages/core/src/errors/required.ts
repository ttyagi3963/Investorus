// A row the code's invariants say must exist (read again under a lock, never deleted): if it is
// missing anyway the request still fails as a 500, but naming what was missing, not a TypeError.
export function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} is missing`);
  return value;
}
