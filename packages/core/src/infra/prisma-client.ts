// Creates the Prisma client every app's composition root uses (T244): the generated client over the
// `pg` driver adapter, with the URL passed in from validated env, never read here.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export type { PrismaClient };

/**
 * Every session runs in UTC whatever the server's or database's time zone (T390). The DateTime
 * columns have no time zone and hold UTC, as Prisma writes and reads them, so the database's own
 * clock (CURRENT_TIMESTAMP, clock_timestamp()) must turn into UTC too when it is stored in or
 * compared with them: in any other zone the leases and job times would move by hours.
 */
const UTC_SESSION = "-c TimeZone=UTC";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, options: UTC_SESSION }),
  });
}
