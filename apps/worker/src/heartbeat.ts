// Liveness signal: the worker has no port, so it rewrites a heartbeat file on an interval. Until
// the job loops arrive (T083), the interval is also what keeps the process running.

/** Calls `write` now and then every `intervalMs`. Returns a function that stops it. */
export function startHeartbeat(write: () => void, intervalMs: number): () => void {
  write();
  const timer = setInterval(write, intervalMs);
  return () => clearInterval(timer);
}
