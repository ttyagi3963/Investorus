// Sign-in and the route guard (T411; T358, T374): each role lands on its own home, a signed-out
// visitor and a corrupt session cookie are sent to /login (the bad cookie cleared), and a role that
// opens another role's pages is sent back to its own home.
import {
  ACCOUNTS,
  HOME,
  expect,
  signInThroughLoginPage,
  test,
  type Role,
} from "../support/fixtures.js";
import { URLS } from "../support/urls.js";

const HEADINGS: Record<Role, string> = {
  agent: "Listing packages",
  investor: "Opportunities",
  secondInvestor: "Opportunities",
  thirdInvestor: "Opportunities",
  ops: "Packages",
};

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  test(`${role} signs in and lands on their home`, async ({ page, context }) => {
    await signInThroughLoginPage(page, role);
    await expect(page.getByRole("heading", { level: 1, name: HEADINGS[role] })).toBeVisible();
    const session = (await context.cookies()).find((c) => c.name === "session");
    expect(session?.httpOnly, "the session cookie is HttpOnly").toBe(true);
  });
}

test("a signed-out visit to /agent goes to /login", async ({ page }) => {
  await page.goto("/agent");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("an investor who opens /agent is sent to their own home", async ({ signedIn }) => {
  const { page } = await signedIn("investor");
  await page.goto("/agent");
  await expect(page).toHaveURL(HOME.investor);
  await expect(page.getByRole("heading", { level: 1, name: "Opportunities" })).toBeVisible();
});

test("a corrupt session cookie sends to /login and is cleared", async ({ page, context }) => {
  await context.addCookies([{ name: "session", value: "not.a-token", url: URLS.web }]);
  await page.goto("/agent/packages/new");
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).some((c) => c.name === "session")).toBe(false);
});
