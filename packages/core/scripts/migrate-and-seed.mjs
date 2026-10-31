#!/usr/bin/env node
// The compose `migrate` service: apply new database migrations, then exit. The app services
// start only after it succeeds, and repeating it is safe (`migrate deploy` skips applied ones).
// The seed step is added with the seed task (T099).

import { execFileSync } from "node:child_process";

console.log("migrate: applying migrations");
// A shell is needed on Windows to run the prisma .cmd shim; arguments are fixed strings.
execFileSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
console.log("migrate: done");
