// Runs the seed against DATABASE_URL: the compose `migrate` service calls it after the migrations
// (compiled to dist/infra/seed/run.js, since the image has no TypeScript runner). A missing URL
// stops it with the name printed.
import { z } from "zod";
import { createPrismaClient } from "../prisma-client.js";
import { seedDemoAccounts } from "./seed.js";

const env = z.object({ DATABASE_URL: z.string().min(1) }).safeParse(process.env);
if (!env.success) {
  process.stderr.write("seed: DATABASE_URL is not set\n");
  process.exit(1);
}

const prisma = createPrismaClient(env.data.DATABASE_URL);
try {
  await seedDemoAccounts(prisma);
  process.stdout.write("seed: demo accounts ready\n");
} finally {
  await prisma.$disconnect();
}
