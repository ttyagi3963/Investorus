// Workspace boundary rules (Constitution I, IV, V, XXI; research R22).
//
// ESLint replaces (does not merge) a rule's options when several config objects match one
// file, so each entry below states the COMPLETE restriction list for its files. Later entries
// win; keep the most specific globs last.

const RULE = "@typescript-eslint/no-restricted-imports";
const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];

const msg = {
  adapters:
    "Only a composition root (src/container.ts) may import @clever/core/adapters (Constitution I, research R22).",
  prisma:
    "Prisma is allowed only in packages/core *Impl.ts files, packages/core/src/infra, and packages/core/prisma; mappers may use type-only imports (Constitution IV).",
  core: "apps/web, packages/contracts, and packages/ui must not import server-only domain code (Constitution XXI).",
  ui: "packages/contracts must not import the design system.",
  deep: "Import from the package barrel or a documented subpath, not internal files (Constitution V).",
  apps: "Apps must not import each other (Constitution XXI.3). Share code through packages/*.",
};

const path = {
  adapters: { name: "@clever/core/adapters", message: msg.adapters },
  prisma: { name: "@prisma/client", message: msg.prisma },
  prismaTypes: { name: "@prisma/client", message: msg.prisma, allowTypeImports: true },
  core: { name: "@clever/core", message: msg.core },
  ui: { name: "@clever/ui", message: msg.ui },
};

const pattern = {
  deep: {
    group: ["@clever/*/src", "@clever/*/src/**", "@clever/*/dist", "@clever/*/dist/**"],
    message: msg.deep,
  },
  apps: {
    group: [
      "@clever/api",
      "@clever/api/**",
      "@clever/worker",
      "@clever/worker/**",
      "@clever/web",
      "@clever/web/**",
      "@clever/sandbox",
      "@clever/sandbox/**",
    ],
    message: msg.apps,
  },
  generated: { group: ["**/generated/prisma", "**/generated/prisma/**"], message: msg.prisma },
  generatedTypes: {
    group: ["**/generated/prisma", "**/generated/prisma/**"],
    message: msg.prisma,
    allowTypeImports: true,
  },
  coreSubpaths: { group: ["@clever/core/**"], message: msg.core },
  uiSubpaths: { group: ["@clever/ui/**"], message: msg.ui },
};

const restrict = (paths, patterns) => ({ [RULE]: ["error", { paths, patterns }] });

export const boundaryConfigs = [
  {
    name: "clever/boundaries/default",
    files: TS_FILES,
    rules: restrict([path.adapters, path.prisma], [pattern.deep, pattern.apps, pattern.generated]),
  },
  {
    name: "clever/boundaries/prisma-adapters",
    files: [
      "packages/core/src/**/*Impl.ts",
      "packages/core/src/infra/**/*.ts",
      "packages/core/prisma/**/*.ts",
      "packages/core/prisma.config.ts",
    ],
    rules: restrict([path.adapters], [pattern.deep, pattern.apps]),
  },
  {
    name: "clever/boundaries/mappers",
    files: ["packages/core/src/**/*.mapper.ts"],
    rules: restrict(
      [path.adapters, path.prismaTypes],
      [pattern.deep, pattern.apps, pattern.generatedTypes],
    ),
  },
  {
    name: "clever/boundaries/composition-roots",
    files: ["apps/*/src/container.ts"],
    rules: restrict([path.prisma], [pattern.deep, pattern.apps, pattern.generated]),
  },
  {
    name: "clever/boundaries/web",
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: restrict(
      [path.prisma, path.core],
      [pattern.deep, pattern.apps, pattern.generated, pattern.coreSubpaths],
    ),
  },
  {
    name: "clever/boundaries/ui",
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: restrict(
      [path.prisma, path.core],
      [pattern.deep, pattern.apps, pattern.generated, pattern.coreSubpaths],
    ),
  },
  {
    name: "clever/boundaries/contracts",
    files: ["packages/contracts/**/*.ts"],
    rules: restrict(
      [path.prisma, path.core, path.ui],
      [pattern.deep, pattern.apps, pattern.generated, pattern.coreSubpaths, pattern.uiSubpaths],
    ),
  },
];
