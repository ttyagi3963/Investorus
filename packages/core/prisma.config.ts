// Prisma 7 settings: where the schema and migrations live, and which databases to use. URLs come
// from the environment (.env in compose, Testcontainers in tests, SHADOW_DATABASE_URL in CI's
// drift check), so nothing here is secret.
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
