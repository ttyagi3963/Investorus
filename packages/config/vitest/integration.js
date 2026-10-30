// Integration tier (Constitution XV): runs against throwaway PostgreSQL 17 / Redis 7
// containers (Testcontainers). Requires Docker. Files run one at a time so containers
// do not compete for the reviewer-sized machine.
import { defineConfig } from "vitest/config";

export function integrationConfig() {
  return defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.int.test.ts", "test/**/*.int.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      fileParallelism: false,
      passWithNoTests: true,
      restoreMocks: true,
    },
  });
}

export default integrationConfig();
