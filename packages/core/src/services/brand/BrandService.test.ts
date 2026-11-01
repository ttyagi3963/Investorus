// Guards the brand rules (T348; FR-093, FR-095): only operations change a brand's theme; a token set
// the validator refuses saves nothing and comes back with each failure as a field error; a saved
// theme bumps the brand's version, so caches replace it, and is audited.
import { readFileSync } from "node:fs";
import type { Actor } from "@clever/contracts/auth";
import { ForbiddenError, ValidationError } from "@clever/contracts/common";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { BrandService } from "./BrandService.js";

const CLEVER = new URL("../../../../../seed/brands/clever/", import.meta.url);
const read = (file: string) => JSON.parse(readFileSync(new URL(file, CLEVER), "utf8"));
const ops: Actor = { userId: "user-ops", role: "OPS", agentId: null };
const agent: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };

function setup() {
  const uow = new InMemoryUnitOfWork();
  const tokens = read("tokens.json");
  uow.repos.brands.rows.set("clever", {
    id: "clever",
    name: "Clever",
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

    await expect(brands.updateTheme(agent, "clever", { tokens })).rejects.toThrow(ForbiddenError);
    const refused = await brands.updateTheme(ops, "clever", { tokens: broken }).catch((e) => e);

    expect(refused).toBeInstanceOf(ValidationError);
    expect(refused.details.fields).toContainEqual(
      expect.objectContaining({ field: "--brand-layout-page-padding-x" }),
    );
    expect(uow.repos.brands.rows.get("clever")!.tokenVersion).toBe(1);
    expect(uow.repos.audit.entries).toEqual([]);
  });

  it("saves a valid set under the next version and audits who changed it", async () => {
    const { uow, tokens, brands } = setup();

    const theme = await brands.updateTheme(ops, "clever", { tokens });

    expect(theme.tokenVersion).toBe(2);
    expect(uow.repos.audit.entries).toEqual([
      expect.objectContaining({
        actorId: "user-ops",
        action: "BRAND_THEME_UPDATED",
        entityId: "clever",
        details: { tokenVersion: 2 },
      }),
    ]);
  });
});
