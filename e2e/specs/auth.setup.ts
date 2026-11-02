// Signs each demo role in once through the real login page and saves its browser state (T411), so
// the specs start signed in without repeating the form. Fails first, and plainly, when no stack is
// listening at the configured addresses.
import { test as setup } from "@playwright/test";
import {
  ACCOUNTS,
  authFile,
  expect,
  signInThroughLoginPage,
  type Role,
} from "../support/fixtures.js";
import { URLS } from "../support/urls.js";

setup("the stack is up", async ({ request }) => {
  const health = await request.get(`${URLS.api}/api/v1/health`).catch(() => null);
  expect(health?.ok(), `no api answered at ${URLS.api}; start the stack first`).toBe(true);
});

for (const role of Object.keys(ACCOUNTS) as Role[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await signInThroughLoginPage(page, role);
    await page.context().storageState({ path: authFile(role) });
  });
}
