// Runs the seed against DATABASE_URL: the compose `migrate` service calls it after the migrations
// (compiled to dist/infra/seed/run.js, since the image has no TypeScript runner). The deal demo
// stores a seller, so it needs the PII and address-hash keys too. A missing setting stops it with
// the names printed.
import { z } from "zod";
import { AesGcmPiiCipherImpl } from "../../providers/pii-cipher/AesGcmPiiCipherImpl.js";
import { createAddressHasher } from "../../providers/pii-cipher/address-hasher.js";
import { createPrismaClient } from "../prisma-client.js";
import { seedConfig, seedDealDemo } from "./deal-demo.js";
import { seedDemoAccounts } from "./seed.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PII_ENCRYPTION_KEY: z.string().min(1),
    ADDRESS_HASH_KEY: z.string().min(1),
  })
  .safeParse(process.env);
if (!env.success) {
  const missing = env.error.issues.map((issue) => issue.path.join(".")).join(", ");
  process.stderr.write(`seed: ${missing} not set\n`);
  process.exit(1);
}

const prisma = createPrismaClient(env.data.DATABASE_URL);
try {
  await seedDemoAccounts(prisma);
  await seedConfig(prisma);
  await seedDealDemo(prisma, {
    cipher: new AesGcmPiiCipherImpl(env.data.PII_ENCRYPTION_KEY),
    addressHash: createAddressHasher(env.data.ADDRESS_HASH_KEY),
  });
  process.stdout.write("seed: demo accounts, config, and the deal demo ready\n");
} finally {
  await prisma.$disconnect();
}
