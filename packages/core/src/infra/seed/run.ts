// Runs the seed against DATABASE_URL: the compose `migrate` service calls it after the migrations
// (compiled to dist/infra/seed/run.js, since the image has no TypeScript runner). The deal demo
// stores a seller, so it needs the PII and address-hash keys too. A missing setting stops it with
// the names printed. The brands come from seed/brands/ (T347): SEED_BRANDS_DIR in the migrate image,
// the repository's folder otherwise.
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AesGcmPiiCipherImpl } from "../../providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../../providers/pii-cipher/address-hasher.js";
import { createPrismaClient } from "../prisma-client.js";
import { seedBrands } from "./brands.js";
import { seedConfig, seedDealDemo } from "./deal-demo.js";
import { seedBuyBoxVersions, seedDemoAccounts } from "./seed.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PII_ENCRYPTION_KEY: z.string().min(1),
    ADDRESS_HASH_KEY: z.string().min(1),
    SEED_BRANDS_DIR: z
      .string()
      .min(1)
      .default(fileURLToPath(new URL("../../../../../seed/brands/", import.meta.url))),
  })
  .safeParse(process.env);
if (!env.success) {
  const missing = env.error.issues.map((issue) => issue.path.join(".")).join(", ");
  process.stderr.write(`seed: ${missing} not set\n`);
  process.exit(1);
}

const prisma = createPrismaClient(env.data.DATABASE_URL);
try {
  await seedBrands(prisma, env.data.SEED_BRANDS_DIR);
  await seedDemoAccounts(prisma);
  await seedConfig(prisma);
  // Buy box versions first: matching the deal demo, and the console's "Why?", judge each box by the
  // version it had when the listing was matched (T373).
  await seedBuyBoxVersions(prisma);
  await seedDealDemo(prisma, {
    cipher: new AesGcmPiiCipherImpl(env.data.PII_ENCRYPTION_KEY),
    addressHash: createAddressHasher(env.data.ADDRESS_HASH_KEY),
  });
  process.stdout.write("seed: brands, demo accounts, config, and the deal demo ready\n");
} finally {
  await prisma.$disconnect();
}
