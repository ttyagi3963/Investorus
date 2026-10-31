#!/usr/bin/env node
// The compose `migrate` service (T232, T101): apply database migrations, then run the seed.
// It runs once on every `docker compose up` and exits; the app services start only after it
// succeeds. Both steps are safe to repeat: `migrate deploy` applies only new migrations, and
// the seed upserts by natural keys (T099), so restarts add no duplicates.
//
// Until the schema exists (T031), there is nothing to migrate or seed, so it says so and exits.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SCHEMA = "prisma/schema.prisma";

function prisma(args) {
  execFileSync("prisma", args, { stdio: "inherit", shell: process.platform === "win32" });
}

if (!existsSync(SCHEMA)) {
  console.log(`migrate: no ${SCHEMA} yet (it arrives with T031). Nothing to migrate or seed.`);
  process.exit(0);
}

console.log("migrate: applying migrations");
prisma(["migrate", "deploy"]);

console.log("migrate: running the seed");
prisma(["db", "seed"]);

console.log("migrate: done");
