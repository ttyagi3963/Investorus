// White-label (T411; FR-091 to FR-094): the partner host renders the partner brand (its name, logo,
// and colors, which reach the components through CSS variables), the switcher on /design-system
// changes the brand, and the style guide renders without a script or console error.
import type { Page } from "@playwright/test";
import { choose, expect, expectImageLoaded, test } from "../support/fixtures.js";
import { URLS } from "../support/urls.js";

const PARTNER = "Larkspur Home Offers";

/** The brand's primary action color, and what the sign-in button is painted with. */
const colors = (page: Page) =>
  page.evaluate(() => ({
    token: getComputedStyle(document.documentElement)
      .getPropertyValue("--brand-semantic-color-action-primary")
      .trim(),
    button: getComputedStyle(
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Sign in")!,
    ).backgroundColor,
  }));

test("the partner host renders the partner brand", async ({ browser, page }) => {
  await page.goto("/login");
  const standard = await colors(page);

  const partner = await (await browser.newContext({ baseURL: URLS.partner })).newPage();
  await partner.goto("/login");
  await expect(partner.locator("html")).toHaveAttribute("data-brand", "larkspur");
  await expect(partner).toHaveTitle(new RegExp(PARTNER));
  await expect(partner.getByRole("region", { name: PARTNER })).toBeVisible();
  const logo = partner.getByRole("region", { name: PARTNER }).locator("img").first();
  await expect(logo).toHaveAttribute("src", /\/brands\/larkspur\//);
  await expectImageLoaded(logo);

  const branded = await colors(partner);
  expect(branded.token, "the partner's own primary color token").not.toBe(standard.token);
  expect(branded.button, "the button is painted from the token").not.toBe(standard.button);
  await partner.context().close();
});

test("the switcher on /design-system changes the brand, and the guide renders cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/design-system");
  await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
  for (const section of ["Colors", "Type", "Spacing", "Shape and elevation", "Components"]) {
    await expect(page.getByRole("region", { name: section })).toBeVisible();
  }
  await expect(page.locator("html")).not.toHaveAttribute("data-brand", "larkspur");

  await choose(page, "Brand", PARTNER);
  await expect(page.locator("html")).toHaveAttribute("data-brand", "larkspur");
  await expect(page.getByText(`of the ${PARTNER} tokens`)).toBeVisible();
  expect(errors, "no page or console errors").toEqual([]);
});
