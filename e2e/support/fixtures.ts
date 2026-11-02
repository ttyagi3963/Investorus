// The specs' shared fixtures (T411): the demo accounts by role, and `signedIn(role)`, which opens a
// browser context already holding that role's session cookie (saved by auth.setup.ts after a real
// sign-in through the login page) with a BFF client bound to it. A journey with several people opens
// one context each, so their cookies never mix. `eventually` polls for what the worker does.
import { join } from "node:path";
import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { Bff } from "./bff.js";
import { URLS } from "./urls.js";

export const ACCOUNTS = {
  agent: "avery@example.com",
  investor: "summit@example.com",
  secondInvestor: "harbor@example.com",
  thirdInvestor: "ridge@example.com",
  ops: "morgan@example.com",
} as const;
export type Role = keyof typeof ACCOUNTS;
const PASSWORD = "demo1234";

/** Each role's home, where sign-in lands (apps/web/src/features/auth/role-home.ts). */
export const HOME: Record<Role, RegExp> = {
  agent: /\/agent$/,
  investor: /\/investor$/,
  secondInvestor: /\/investor$/,
  thirdInvestor: /\/investor$/,
  ops: /\/ops\/packages$/,
};

/** Signs in through the login page, as a person would; the BFF sets the HttpOnly cookie. */
export async function signInThroughLoginPage(page: Page, role: Role): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ACCOUNTS[role]);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(HOME[role]);
}

/** Where each role's signed-in cookie is kept between the setup project and the specs. */
export const authFile = (role: Role) => join(import.meta.dirname, "..", ".auth", `${role}.json`);

export type Session = { page: Page; bff: Bff };

export const test = base.extend<{ signedIn: (role: Role) => Promise<Session> }>({
  signedIn: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const context = await browser.newContext({ storageState: authFile(role), baseURL: URLS.web });
      contexts.push(context);
      return { page: await context.newPage(), bff: new Bff(context.request, URLS.web) };
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };

/**
 * Retries `check` until it passes: for what the worker does after a request returns (matching,
 * a deadline, a delivery). Polls; never a fixed sleep.
 */
export async function eventually(check: () => Promise<void>, timeout = 60_000): Promise<void> {
  await expect(check).toPass({ timeout, intervals: [500, 1_000, 2_000] });
}

/** Waits until matching has shared the package with the investor (their view stops being a 404). */
export async function waitForMatch(investor: Bff, packageId: string): Promise<void> {
  await eventually(async () => {
    expect((await investor.investorPackage(packageId)).status()).toBe(200);
  });
}

/** Waits until the image has loaded and decoded (a lazy image loads once it is scrolled to). */
export async function expectImageLoaded(image: Locator): Promise<void> {
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)))
    .toBeGreaterThan(0);
}

/** The `datetime-local` value the browser shows for an instant, in the browser's own time zone. */
export function localInput(page: Page, at: Date): Promise<string> {
  return page.evaluate((ms) => {
    const d = new Date(ms);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }, at.getTime());
}

/**
 * Checks one of the app's React Aria checkboxes, chips, or radios, found by its name. The input is
 * visually hidden behind its label, so the label is what a person presses.
 */
export async function tick(
  scope: Page | Locator,
  name: string | RegExp,
  role: "checkbox" | "radio" = "checkbox",
): Promise<void> {
  const page = "page" in scope ? scope.page() : scope;
  const label = scope.locator("label").filter({ has: page.getByRole(role, { name, exact: true }) });
  await label.click();
  await expect(label.getByRole(role)).toBeChecked();
}

/** Picks an option in one of the app's React Aria selects, found by its label. */
export async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
