// Creates the Prisma client every app's composition root uses (T244): the generated client over the
// `pg` driver adapter, with the URL passed in from validated env, never read here.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export type { PrismaClient };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
