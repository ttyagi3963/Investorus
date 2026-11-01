#!/usr/bin/env node
// The compose `migrate` service: apply new database migrations, then seed the demo data, then
// exit. The app services start only after it succeeds, and repeating it is safe: `migrate deploy`
// skips applied migrations, and the seed upserts by email.

import { execFileSync } from "node:child_process";

console.log("migrate: applying migrations");
// A shell is needed on Windows to run the prisma .cmd shim; arguments are fixed strings.
execFileSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log("migrate: seeding demo data");
execFileSync(process.execPath, ["dist/infra/seed/run.js"], { stdio: "inherit" });
console.log("migrate: done");
