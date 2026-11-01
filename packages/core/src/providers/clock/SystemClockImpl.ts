// The real clock, wired in each app's composition root; tests pass a fixed clock instead.
import type { IClock } from "./IClock.js";

export class SystemClockImpl implements IClock {
  now(): Date {
    return new Date();
  }
}
