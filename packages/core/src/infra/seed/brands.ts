// Loads the brands in seed/brands/<id>/ into the Brand table (T347; FR-092): each folder holds the
// brand's DTCG tokens, its content, and the hosts that open it. Every brand is checked with the same
// validator the api uses, so a broken file stops the seed with the failures named. A brand is written
// only when its files changed since the seed last loaded them (their hash is kept), so a theme an
// operator edited in the console survives a restart; a changed file replaces it and bumps the version.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandContentSchema, validateBrandTokens } from "@clever/contracts/brand";
import { z } from "zod";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

const hostsSchema = z.array(z.string().min(1)).min(1);

const readJson = async (dir: string, file: string): Promise<unknown> =>
  JSON.parse(await readFile(join(dir, file), "utf8"));

export async function seedBrands(prisma: PrismaClient, brandsDir: string): Promise<void> {
  const folders = (await readdir(brandsDir, { withFileTypes: true })).filter((e) =>
    e.isDirectory(),
  );
  for (const { name: id } of folders) {
    const dir = join(brandsDir, id);
    const tokens = await readJson(dir, "tokens.json");
    const content = brandContentSchema.parse(await readJson(dir, "content.json"));
    const hosts = hostsSchema.parse(await readJson(dir, "hosts.json"));
    if (content.brandId !== id)
      throw new Error(`seed/brands/${id}: content names ${content.brandId}`);
    const checked = validateBrandTokens(tokens);
    if (!checked.ok) {
      const failures = checked.problems.map((p) => `${p.field}: ${p.message}`).join("; ");
      throw new Error(`seed/brands/${id} is not a usable brand: ${failures}`);
    }

    const seedHash = createHash("sha256")
      .update(JSON.stringify({ tokens, content, hosts }))
      .digest("hex");
    const data = {
      name: content.displayName,
      tokens: tokens as Prisma.InputJsonValue,
      content: content as Prisma.InputJsonValue,
      hosts,
      seedHash,
    };
    const existing = await prisma.brand.findUnique({ where: { id }, select: { seedHash: true } });
    if (!existing) {
      await prisma.brand.create({ data: { id, ...data } });
    } else if (existing.seedHash !== seedHash) {
      await prisma.brand.update({
        where: { id },
        data: { ...data, tokenVersion: { increment: 1 } },
      });
    }
  }
}
