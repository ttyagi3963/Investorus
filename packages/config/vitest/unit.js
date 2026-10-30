// Unit tier (Constitution XV): fast and offline. No database, network, or containers.
// Integration tests (*.int.test.ts) are excluded and run through ./integration.js.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const noNetworkSetup = fileURLToPath(new URL("./no-network.js", import.meta.url));

/** @param {{ environment?: "node" | "jsdom" }} [options] */
export function unitConfig(options = {}) {
  return defineConfig({
    test: {
      environment: options.environment ?? "node",
      include: ["src/**/*.test.{ts,tsx,js}", "test/**/*.test.{ts,tsx,js}", "eslint/**/*.test.js"],
      exclude: ["**/*.int.test.ts", "**/node_modules/**", "**/dist/**", "**/.next/**"],
      setupFiles: [noNetworkSetup],
      passWithNoTests: true,
      restoreMocks: true,
      unstubGlobals: true,
    },
  });
}

export default unitConfig();
