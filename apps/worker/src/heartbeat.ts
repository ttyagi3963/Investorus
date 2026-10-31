// Liveness signal for the container healthcheck: the worker has no port, so it rewrites a
// heartbeat file on an interval and the healthcheck reads its age.

/** Calls `write` now and then every `intervalMs`. Returns a function that stops it. */
export function startHeartbeat(write: () => void, intervalMs: number): () => void {
  write();
  const timer = setInterval(write, intervalMs);
  return () => clearInterval(timer);
}
