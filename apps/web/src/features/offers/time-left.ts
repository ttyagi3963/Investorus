// Time left until an offer deadline (T302), in words, and a clock that ticks every 30 seconds so
// the dashboard's countdowns stay current without a reload.
import { useEffect, useState } from "react";

export function timeLeft(deadline: string | null, now: number): string {
  if (!deadline) return "No deadline";
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return "Deadline passed";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  return hours > 0 ? `${hours} h ${minutes} min left` : `${minutes} min left`;
}

export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
