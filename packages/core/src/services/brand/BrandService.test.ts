// Guards the brand rules (T348, T353; FR-093, FR-095): only operations change a brand's theme; a
// token set the validator refuses saves nothing and comes back with each failure as a field error; a
// saved theme bumps the brand's version, so caches replace it, and is audited; a save over a version
// another operator already replaced is refused.
import { readFileSync } from "node:fs";
import type { Actor } from "@clever/contracts/auth";
import { ConflictError, ForbiddenError, ValidationError } from "@clever/contracts/common";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { BrandService } from "./BrandService.js";

// A real seed file supplies a complete, valid token set; the brand under test is synthetic (XVI).
const SEED = new URL("../../../../../seed/brands/clever/", import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, SEED), "utf8"));
const ops: Actor = { userId: "user-ops", role: "OPS", agentId: null };
const agent: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

function setup() {
  const uow = new InMemoryUnitOfWork();
  const tokens = read("tokens.json");
  uow.repos.brands.rows.set("test", {
    id: "test",
    name: "Test Homes",
    hosts: ["localhost"],
    tokens,
    content: read("content.json"),
    tokenVersion: 1,
  });
  return { uow, tokens, brands: new BrandService(uow) };
}

describe("BrandService.updateTheme", () => {
  it("refuses anyone but operations, and a token set that fails a check, saving nothing", async () => {
    const { uow, tokens, brands } = setup();
    const broken = structuredClone(tokens);
    delete broken.layout["page-padding-x"];

    await expect(brands.updateTheme(agent, "test", { tokens, tokenVersion: 1 })).rejects.toThrow(
      ForbiddenError,
    );
    const refused = await brands
      .updateTheme(ops, "test", { tokens: broken, tokenVersion: 1 })
      .catch((e) => e);

    expect(refused).toBeInstanceOf(ValidationError);
    expect(refused.details.fields).toContainEqual(
      expect.objectContaining({ field: "--brand-layout-page-padding-x" }),
    );
    expect(uow.repos.brands.rows.get("test")!.tokenVersion).toBe(1);
    expect(uow.repos.audit.entries).toEqual([]);
  });

  it("saves a valid set under the next version, audits it, and refuses a save over a stale version", async () => {
    const { uow, tokens, brands } = setup();

    const theme = await brands.updateTheme(ops, "test", { tokens, tokenVersion: 1 });
    const stale = brands.updateTheme(ops, "test", { tokens, tokenVersion: 1 });

    await expect(stale).rejects.toThrow(ConflictError);
    expect(theme.tokenVersion).toBe(2);
    expect(uow.repos.audit.entries).toEqual([
      expect.objectContaining({
        actorId: "user-ops",
        action: "BRAND_THEME_UPDATED",
        entityId: "test",
        details: { tokenVersion: 2 },
      }),
    ]);
  });
});
