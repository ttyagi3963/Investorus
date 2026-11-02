// Core's integration tier: the shared preset, plus one Postgres for the whole run whose migrated
// template each test file copies (test/migrated-template.ts).
import { integrationConfig } from "@clever/config/vitest/integration";
import { mergeConfig } from "vitest/config";

export default mergeConfig(integrationConfig(), {
  test: { globalSetup: ["test/migrated-template.ts"] },
});
