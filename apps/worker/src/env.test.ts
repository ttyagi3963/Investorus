// Guards the worker's startup check (T322; XII): the committed demo settings pass it, so the worker
// starts with `docker compose up` and runs its jobs (a broken pattern once stopped it at startup).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workerEnvSchema } from "./env.js";

/** The committed .env as key-value pairs: one KEY=value per line, # comments ignored. */
function committedEnv(): Record<string, string> {
  const text = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

describe("worker settings", () => {
  it("accept the committed demo settings", () => {
    expect(workerEnvSchema.safeParse(committedEnv()).error?.issues ?? []).toEqual([]);
  });
});
