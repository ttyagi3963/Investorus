// An agent builds a package in the form, sees what blocks publishing, uploads a photo from the
// browser, and publishes (T411; FR-012, T389). The upload is the browser's own signed PUT to the
// storage origin, so a page policy that blocked it, or the photo's display, fails here. It runs on
// the default host and on the partner brand's host, whose origin the storage must also accept.
import type { ConsoleMessage } from "@playwright/test";
import { JPEG, isoDate, packageInput, street, uniqueTag, ZIP } from "../support/data.js";
import {
  choose,
  expect,
  expectImageLoaded,
  signInThroughLoginPage,
  test,
  tick,
} from "../support/fixtures.js";
import { URLS } from "../support/urls.js";

for (const [host, origin] of [
  ["the default host", URLS.web],
  ["the partner brand's host", URLS.partner],
] as const) {
  test(`an agent publishes a package with a photo on ${host}`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: origin });
    const page = await context.newPage();
    const policyViolations: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
      if (/Content Security Policy/i.test(message.text())) policyViolations.push(message.text());
    });
    const tag = uniqueTag();
    await signInThroughLoginPage(page, "agent");

    await test.step("save a draft with the property and the price", async () => {
      await page.goto("/agent/packages/new");
      await page.getByLabel("Full name").fill(`Seller ${tag}`);
      await page.getByLabel("Email").fill(`seller-${tag}@example.com`);
      await page.getByLabel("Street address").fill(street(tag));
      await page.getByLabel("ZIP code").fill(ZIP);
      await choose(page, "Property type", "Single family");
      await page.getByLabel("Beds").fill("3");
      await page.getByLabel("Baths", { exact: true }).fill("2");
      await page.getByLabel("Square feet", { exact: true }).fill("1400");
      await page.getByLabel("Year built").fill("1978");
      await choose(page, "Condition", "Fair");
      await page.getByLabel("Lowest price").fill("240000");
      await page.getByLabel("Highest price").fill("250000");
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page).toHaveURL(/\/agent\/packages\/[^/]+$/);
      await expect(page.getByRole("heading", { level: 1, name: street(tag) })).toBeVisible();
    });

    await test.step("publishing lists what is missing", async () => {
      await page.getByRole("button", { name: "Publish" }).click();
      const blockers = page.getByRole("alert").filter({ hasText: "Fix these to publish:" });
      for (const field of [
        "Photos",
        "Closing window start",
        "Listed for sale now",
        "Offer programs",
      ]) {
        await expect(blockers.getByRole("link", { name: field })).toBeVisible();
      }
    });

    await test.step("upload a photo from the browser and see it load", async () => {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Add photos" }).click();
      await (await chooser).setFiles(JPEG);
      const photo = page.getByRole("img", { name: `${street(tag)}, view 1` });
      await expect(photo).toBeVisible();
      await expect(photo).toHaveAttribute("src", new RegExp(`^${URLS.sandbox}/`));
      await expectImageLoaded(photo);
    });

    await test.step("fill the publishing fields and publish", async () => {
      await page.getByLabel("Closing window starts").fill(isoDate(14));
      await page.getByLabel("Closing window ends").fill(isoDate(60));
      await choose(page, "Is the home listed for sale now?", "No");
      await tick(page, "Cash offer");
      await page.getByRole("button", { name: "Save changes" }).click();
      await expect(
        page.getByRole("region", { name: "Activity" }).getByText("Edited", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByText("Accepting offers", { exact: true })).toBeVisible();
      await expect(page.getByText("Fix these to publish:")).toBeHidden();
    });

    expect(policyViolations, "no Content-Security-Policy violation").toEqual([]);
    await context.close();
  });
}

// "Saved." comes after the refetch, whose new version reloads the form's fields; the notice must
// survive that reload (T414).
test("an agent who saves changes to a draft is told it saved", async ({ signedIn }) => {
  const { page, bff } = await signedIn("agent");
  const draft = await bff.createPackage(packageInput(uniqueTag(), 250_000));
  await page.goto(`/agent/packages/${draft.id}`);
  await page.getByLabel("Neighborhood").fill("Bouldin Creek");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
});
