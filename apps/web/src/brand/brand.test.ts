// @vitest-environment node
// Keeps the theme and the brand contract in step (T327, T347): every `--brand-*` variable
// packages/ui/src/styles/theme.css reads is one the brand validator requires, and the validator
// requires nothing the theme does not read. The brand files themselves are checked in
// packages/contracts (brand.test.ts) and by the api when operations save a theme.
import { readFileSync } from "node:fs";
import { REQUIRED_BRAND_VARIABLES } from "@clever/contracts/brand";
import { describe, expect, it } from "vitest";

const theme = readFileSync(
  new URL("../../../../packages/ui/src/styles/theme.css", import.meta.url),
  "utf8",
);

describe("theme.css", () => {
  it("reads exactly the brand variables the validator requires", () => {
    // A long name may be wrapped onto its own line inside var( ... ).
    const read = [
      ...new Set([...theme.matchAll(/var\(\s*(--brand-[\w-]+)\s*\)/g)].map((m) => m[1]!)),
    ];
    expect(read.sort()).toEqual([...REQUIRED_BRAND_VARIABLES].sort());
  });
});
