// Accessibility (T411; constitution XI, FR-096): axe checks the screens each role starts from
// against WCAG 2.1 A and AA, and no serious or critical violation is allowed. A violation is listed
// with its rule, its help text, and the elements it found, so a failure says what to fix.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Bff } from "../support/bff.js";
import { buyBoxInput, packageInput, uniqueTag } from "../support/data.js";
import { authFile, expect, test, waitForMatch } from "../support/fixtures.js";
import { URLS } from "../support/urls.js";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      elements: v.nodes.map((node) => node.target.join(" ")),
    }));
}

test("the login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the agent's package form", async ({ signedIn }) => {
  const { page } = await signedIn("agent");
  await page.goto("/agent/packages/new");
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the style guide", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("region", { name: "Components" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test.describe("screens of a published package", () => {
  let packageId: string;

  test.beforeAll(async ({ browser }) => {
    // Set up once, through the BFF with the saved sessions: a package matched to the investor.
    const contexts = await Promise.all(
      (["agent", "investor"] as const).map((role) =>
        browser.newContext({ storageState: authFile(role) }),
      ),
    );
    const [agent, investor] = contexts.map((context) => new Bff(context.request, URLS.web));
    const tag = uniqueTag();
    await investor!.createBuyBox(buyBoxInput(`E2E a11y ${tag}`, 250_000, 300_000));
    packageId = (await agent!.publishedPackage(packageInput(tag, 280_000))).id;
    await waitForMatch(investor!, packageId);
    for (const context of contexts) await context.close();
  });

  test("the investor's package page", async ({ signedIn }) => {
    const { page } = await signedIn("investor");
    await page.goto(`/investor/packages/${packageId}`);
    await expect(page.getByRole("button", { name: "Send offer" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("the operations trace", async ({ signedIn }) => {
    const { page } = await signedIn("ops");
    await page.goto(`/ops/packages/${packageId}`);
    await expect(page.getByRole("region", { name: "Investors" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});
