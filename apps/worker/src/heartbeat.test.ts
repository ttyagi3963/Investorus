import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startHeartbeat } from "./heartbeat.js";

describe("worker heartbeat (T232)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("beats immediately, then on every interval, and stops when asked", () => {
    const write = vi.fn();
    const stop = startHeartbeat(write, 10_000);
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(25_000);
    expect(write).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(60_000);
    expect(write).toHaveBeenCalledTimes(3);
  });
});
