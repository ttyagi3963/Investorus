// Guards the brand seed on a real Postgres (T347; FR-092): every brand in seed/brands/ is loaded with
// its tokens, content, and hosts; a second run changes nothing; and an operator's theme edit survives
// a restart, because the seed rewrites a brand only when its files changed.
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient, type PrismaClient } from "../src/infra/prisma-client.js";
import { seedBrands } from "../src/infra/seed/brands.js";
import { startMigratedDatabase } from "./database.js";

const BRANDS_DIR = fileURLToPath(new URL("../../../seed/brands/", import.meta.url));

let db: pg.Client;
let prisma: PrismaClient;
let stop: () => Promise<void>;

beforeAll(async () => {
  let url: string;
  ({ db, url, stop } = await startMigratedDatabase());
  prisma = createPrismaClient(url);
});

afterAll(async () => {
  await prisma?.$disconnect();
  await stop?.();
});

const brands = async () =>
  (
    await db.query(
      `SELECT id, hosts, "tokenVersion", tokens->'$description' AS d FROM "Brand" ORDER BY id`,
    )
  ).rows;

describe("seedBrands", () => {
  it("loads each brand once and keeps an operator's edit across a restart", async () => {
    await seedBrands(prisma, BRANDS_DIR);
    const loaded = await brands();
    expect(loaded).toContainEqual(
      expect.objectContaining({ id: "clever", hosts: ["localhost"], tokenVersion: 1 }),
    );

    await db.query(
      `UPDATE "Brand" SET tokens = jsonb_set(tokens, '{$description}', '"edited"'), "tokenVersion" = 2
       WHERE id = 'clever'`,
    );
    await seedBrands(prisma, BRANDS_DIR);

    expect(await brands()).toContainEqual(
      expect.objectContaining({ id: "clever", tokenVersion: 2, d: "edited" }),
    );
    expect((await brands()).length).toBe(loaded.length);
  });
});
