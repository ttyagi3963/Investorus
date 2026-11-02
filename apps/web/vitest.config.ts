import { fileURLToPath } from "node:url";
import { unitConfig } from "@clever/config/vitest/unit";
import { mergeConfig } from "vitest/config";

// The app's `@/` imports (tsconfig paths) resolve the same way in tests (T395).
export default mergeConfig(unitConfig({ environment: "jsdom" }), {
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
