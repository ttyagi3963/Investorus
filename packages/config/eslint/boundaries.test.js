// Verifies the workspace boundary rules (Constitution I, V, XXI; research R22) by linting
// virtual files at the paths where the rules apply. Files do not need to exist on disk.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import config from "./index.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: true, overrideConfig: config });

async function boundaryErrors(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  return result.messages
    .filter((m) => m.ruleId === "@typescript-eslint/no-restricted-imports")
    .map((m) => m.message);
}

describe("boundary rules", () => {
  it("bans Prisma and the domain core in apps/web (XXI.4)", async () => {
    expect(
      await boundaryErrors(
        "apps/web/src/features/x.ts",
        `import { PrismaClient } from "@prisma/client";\nexport { PrismaClient };`,
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "apps/web/src/features/x.ts",
        `import { x } from "@clever/core";\nexport { x };`,
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "apps/web/src/container.ts",
        `import { x } from "@clever/core/adapters";\nexport { x };`,
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "apps/web/src/features/x.ts",
        `import { x } from "@clever/contracts/offer";\nexport { x };`,
      ),
    ).toEqual([]);
  });

  it("allows @clever/core/adapters only in container.ts (I, R22)", async () => {
    const code = `import { x } from "@clever/core/adapters";\nexport { x };`;
    expect(await boundaryErrors("apps/api/src/routes/offers.router.ts", code)).toHaveLength(1);
    expect(
      await boundaryErrors("packages/core/src/services/offer/OfferService.ts", code),
    ).toHaveLength(1);
    expect(await boundaryErrors("apps/api/src/container.ts", code)).toEqual([]);
    expect(await boundaryErrors("apps/worker/src/container.ts", code)).toEqual([]);
  });

  it("allows Prisma only in *Impl.ts, infra, and prisma/; type-only in mappers (IV)", async () => {
    const value = `import { PrismaClient } from "@prisma/client";\nexport { PrismaClient };`;
    const typeOnly = `import type { Offer } from "@prisma/client";\nexport type { Offer };`;
    expect(
      await boundaryErrors("packages/core/src/services/offer/OfferService.ts", value),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "packages/core/src/repositories/offer/PrismaOfferRepositoryImpl.ts",
        value,
      ),
    ).toEqual([]);
    expect(await boundaryErrors("packages/core/src/infra/prisma-client.ts", value)).toEqual([]);
    expect(await boundaryErrors("packages/core/prisma/seed/index.ts", value)).toEqual([]);
    expect(
      await boundaryErrors("packages/core/src/repositories/offer/offer.mapper.ts", typeOnly),
    ).toEqual([]);
    expect(
      await boundaryErrors("packages/core/src/repositories/offer/offer.mapper.ts", value),
    ).toHaveLength(1);
  });

  it("treats the generated Prisma client like @prisma/client", async () => {
    const code = `import { PrismaClient } from "../../generated/prisma/client.js";\nexport { PrismaClient };`;
    expect(
      await boundaryErrors("packages/core/src/services/offer/OfferService.ts", code),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "packages/core/src/repositories/offer/PrismaOfferRepositoryImpl.ts",
        code,
      ),
    ).toEqual([]);
  });

  it("blocks deep imports past package barrels (V)", async () => {
    expect(
      await boundaryErrors(
        "apps/api/src/app.ts",
        `import { x } from "@clever/contracts/src/offer/schemas";\nexport { x };`,
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "apps/api/src/app.ts",
        `import { x } from "@clever/core/dist/index.js";\nexport { x };`,
      ),
    ).toHaveLength(1);
  });

  it("blocks imports between apps (XXI.3)", async () => {
    expect(
      await boundaryErrors(
        "apps/api/src/app.ts",
        `import { x } from "@clever/worker";\nexport { x };`,
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        "apps/worker/src/main.ts",
        `import { x } from "@clever/api/container";\nexport { x };`,
      ),
    ).toHaveLength(1);
  });

  it("keeps contracts and ui free of server code (V, XXI.5)", async () => {
    const core = `import { x } from "@clever/core";\nexport { x };`;
    expect(await boundaryErrors("packages/contracts/src/offer/index.ts", core)).toHaveLength(1);
    expect(await boundaryErrors("packages/ui/src/primitives/Button.tsx", core)).toHaveLength(1);
    expect(
      await boundaryErrors(
        "packages/contracts/src/offer/index.ts",
        `import { x } from "@clever/ui";\nexport { x };`,
      ),
    ).toHaveLength(1);
  });
});
