#!/usr/bin/env node
// CI check for the Prisma schema (T229): `prisma validate`, then a migration drift check that
// fails when schema.prisma has changes no migration covers.
//
// The drift check replays prisma/migrations into a throwaway shadow database and compares the
// result with schema.prisma. It needs SHADOW_DATABASE_URL (CI provides a Postgres 17 service),
// which prisma.config.ts passes on as `datasource.shadowDatabaseUrl`.

import { execFileSync } from "node:child_process";

const SCHEMA = "prisma/schema.prisma";
const MIGRATIONS = "prisma/migrations";
const inCi = process.env.GITHUB_ACTIONS === "true";

function prisma(args) {
  // A shell is needed on Windows to run the prisma .cmd shim; arguments are fixed strings.
  return execFileSync("prisma", args, { stdio: "inherit", shell: process.platform === "win32" });
}

function fail(message) {
  console.error(inCi ? `::error title=Prisma check::${message}` : `Error: ${message}`);
  process.exit(1);
}

console.log("1/2 prisma validate");
prisma(["validate", "--schema", SCHEMA]);

console.log(
  "2/2 migration drift check (migrations replayed into the shadow database vs. schema.prisma)",
);
try {
  prisma([
    "migrate",
    "diff",
    "--from-migrations",
    MIGRATIONS,
    "--to-schema",
    SCHEMA,
    "--exit-code",
  ]);
  console.log("No drift: the migrations match schema.prisma.");
} catch (err) {
  if (err.status === 2) {
    fail(
      "schema.prisma has changes that no migration covers. Run `prisma migrate dev` and commit the migration.",
    );
  }
  fail(`prisma migrate diff failed (exit ${err.status}).`);
}
