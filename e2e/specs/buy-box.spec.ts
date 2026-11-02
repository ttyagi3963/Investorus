// An investor's buy box, typed as people type numbers, matches a new listing (T411; FR-060, T371).
// "$250,000" and "1,200" must be read as numbers, never dropped to "no limit", and a checked chip
// must narrow its list; after the save the box reads back as typed, and once an agent publishes a
// home inside it, the worker's matching puts the home in the investor's opportunities.
import { packageInput, uniqueTag, ZIP } from "../support/data.js";
import { choose, eventually, expect, test, tick } from "../support/fixtures.js";

test("a buy box typed with formatted numbers and chips matches a new listing", async ({
  signedIn,
}) => {
  const { page } = await signedIn("investor");
  const tag = uniqueTag();
  const name = `E2E box ${tag}`;
  const propertyTypes = page.getByRole("group", { name: "Property type" });

  await test.step("create the box with formatted numbers and two property types", async () => {
    await page.goto("/investor/buy-boxes/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await choose(page, "Where", "Only certain ZIP codes");
    await page.getByLabel("States or ZIP codes").fill(ZIP);
    await page.getByLabel("Min price (USD)").fill("$250,000");
    await page.getByLabel("Max price (USD)").fill("$300,000");
    await page.getByLabel("Min square feet").fill("1,200");
    await tick(propertyTypes, "Single family");
    await tick(propertyTypes, "Townhome");
    // Checking a chip switches the list to "only these" (T371).
    await expect(propertyTypes.getByRole("button", { name: /Accept/ })).toContainText(
      "Only the ones checked",
    );
    await page.getByRole("button", { name: "Create buy box" }).click();
    await expect(page).toHaveURL(/\/investor\/buy-boxes\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  await test.step("the saved box reads back as typed", async () => {
    await page.reload();
    await expect(page.getByLabel("Min price (USD)")).toHaveValue("$250,000");
    await expect(page.getByLabel("Max price (USD)")).toHaveValue("$300,000");
    await expect(page.getByLabel("Min square feet")).toHaveValue("1,200");
    await expect(page.getByLabel("Max square feet")).toHaveValue("");
    await expect(page.getByLabel("States or ZIP codes")).toHaveValue(ZIP);
    await expect(propertyTypes.getByRole("checkbox", { name: "Single family" })).toBeChecked();
    await expect(propertyTypes.getByRole("checkbox", { name: "Townhome" })).toBeChecked();
    await expect(propertyTypes.getByRole("checkbox", { name: "Condo" })).not.toBeChecked();
  });

  await test.step("an agent's new listing in the box reaches the investor", async () => {
    const agent = await signedIn("agent");
    const pkg = await agent.bff.publishedPackage(packageInput(tag, 275_000));
    const card = page.locator(`a[href="/investor/packages/${pkg.id}"]`);
    await page.goto("/investor");
    await eventually(async () => {
      await page.reload();
      await expect(card).toBeVisible({ timeout: 2_000 });
    });
    await card.click();
    await expect(page.getByRole("heading", { level: 1, name: `Austin, TX ${ZIP}` })).toBeVisible();
  });
});
