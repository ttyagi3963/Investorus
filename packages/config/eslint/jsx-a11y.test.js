// Verifies that the jsx-a11y recommended rules (Constitution XI, FR-096) apply to the web app
// and the shared UI package, by linting virtual files at those paths.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import config from "./index.js";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: true, overrideConfig: config });

async function a11yRules(file, code) {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  return result.messages.filter((m) => m.ruleId?.startsWith("jsx-a11y/")).map((m) => m.ruleId);
}

const imgWithoutAlt = `export function Photo() {\n  return <img src="/house.jpg" />;\n}\n`;

describe("jsx-a11y rules", () => {
  it("reject an image without alt text in apps/web and packages/ui", async () => {
    expect(await a11yRules("apps/web/src/features/photo.tsx", imgWithoutAlt)).toEqual([
      "jsx-a11y/alt-text",
    ]);
    expect(await a11yRules("packages/ui/src/components/Photo.tsx", imgWithoutAlt)).toEqual([
      "jsx-a11y/alt-text",
    ]);
  });

  it("accept alt text, including an empty alt for decorative images", async () => {
    const withAlt = `export function Photo() {\n  return <img src="/house.jpg" alt="Front of the house" />;\n}\n`;
    const decorative = `export function Divider() {\n  return <img src="/line.svg" alt="" />;\n}\n`;
    expect(await a11yRules("apps/web/src/features/photo.tsx", withAlt)).toEqual([]);
    expect(await a11yRules("packages/ui/src/components/Divider.tsx", decorative)).toEqual([]);
  });

  it("flag other recommended problems, such as a click handler on a non-interactive element", async () => {
    const clickableDiv = `export function Card() {\n  return <div onClick={() => undefined}>Open</div>;\n}\n`;
    const rules = await a11yRules("packages/ui/src/components/Card.tsx", clickableDiv);
    expect(rules).toContain("jsx-a11y/click-events-have-key-events");
    expect(rules).toContain("jsx-a11y/no-static-element-interactions");
  });
});
