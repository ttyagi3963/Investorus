// The operations console (T411; FR-071 to FR-078): a package's trace explains, criterion by
// criterion, why one investor matched and another did not; the CRM comparison lists the package;
// and a CRM outage leaves a delivery that needs attention, which operations retry once the CRM is
// back, until the CRM agrees with the platform. Every outage mode is set back to up afterwards.
import type { Page } from "@playwright/test";
import { buyBoxInput, packageInput, street, uniqueTag } from "../support/data.js";
import {
  eventually,
  expect,
  test,
  tick,
  waitForMatch,
  type Role,
  type Session,
} from "../support/fixtures.js";

test.afterEach(async ({ signedIn }) => {
  const { bff } = await signedIn("ops");
  for (const service of ["crm", "messaging", "storage"] as const) {
    await bff.setSimulation(service, "up");
  }
});

/** One buy box in an opened explanation: its verdict chip, and each criterion's result cell. */
function boxResult(page: Page, box: string) {
  const heading = page.getByRole("heading", { name: box, exact: true });
  const table = page.getByRole("table", { name: `${box}: each criterion and its result` });
  return {
    verdict: heading.locator(".."),
    result: (criterion: string) =>
      table
        .getByRole("row", { name: new RegExp(`^${criterion}\\b`) })
        .getByRole("cell")
        .first(),
  };
}

/** Opens each "Why not matched?" in turn until one explains the named buy box. */
async function openExcludedExplaining(page: Page, box: string): Promise<void> {
  const items = page.getByRole("list", { name: "Investors not matched" }).getByRole("listitem");
  for (const item of await items.all()) {
    await item.getByRole("button", { name: "Why not matched?" }).click();
    await expect(item.getByText(/^Listing version/)).toBeVisible();
    if (await item.getByRole("heading", { name: box, exact: true }).isVisible()) return;
    await item.getByRole("button", { name: "Why not matched?" }).click();
  }
  throw new Error(`No unmatched investor's explanation shows ${box}`);
}

test("the trace explains a match and a miss, and the CRM comparison lists the package", async ({
  signedIn,
}) => {
  const tag = uniqueTag();
  const agent = await signedIn("agent");
  const matched = await signedIn("investor");
  const missed = await signedIn("thirdInvestor");
  const fits = `E2E fits ${tag}`;
  const tooCheap = `E2E too cheap ${tag}`;
  await matched.bff.createBuyBox(buyBoxInput(fits, 250_000, 300_000));
  await missed.bff.createBuyBox(buyBoxInput(tooCheap, 100_000, 150_000));
  const pkg = await agent.bff.publishedPackage(packageInput(tag, 280_000));
  await waitForMatch(matched.bff, pkg.id);
  const { page } = await signedIn("ops");

  await test.step("why the investor matched", async () => {
    await page.goto(`/ops/packages/${pkg.id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: new RegExp(street(tag)) }),
    ).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: `${fits} v1` });
    await row.getByRole("button", { name: "Why matched?" }).click();
    const box = boxResult(page, `${fits} v1`);
    await expect(box.verdict).toContainText("Matched");
    await expect(box.result("Location")).toHaveText(/Passed/);
    await expect(box.result("Price")).toHaveText(/Passed/);
  });

  await test.step("why the other investor did not", async () => {
    await page
      .getByRole("radiogroup", { name: "Show investors" })
      .getByRole("radio", { name: "Not matched" })
      .click();
    await openExcludedExplaining(page, `${tooCheap} v1`);
    const box = boxResult(page, `${tooCheap} v1`);
    await expect(box.verdict).toContainText("Not matched");
    await expect(box.result("Location")).toHaveText(/Passed/);
    await expect(box.result("Price")).toHaveText(/Failed/);
  });

  await test.step("the CRM comparison lists the package", async () => {
    await page.goto("/ops/crm");
    await expect(page.getByRole("link", { name: street(tag) })).toBeVisible();
  });
});

/**
 * With the CRM down, publishes a package and waits until its CRM update is set aside. The worker
 * tries a delivery ten times with a growing wait (2 s doubling, capped at a minute, seeded in
 * ConfigEntry "deliveryRetry") first: about five minutes of real time.
 */
async function packageWithSetAsideCrmUpdate(
  signedIn: (role: Role) => Promise<Session>,
  page: Page,
) {
  const tag = uniqueTag();
  const agent = await signedIn("agent");
  await page.goto("/ops/simulations");
  await tick(page.getByRole("radiogroup", { name: "CRM mode" }), /^Down/, "radio");
  const pkg = await agent.bff.publishedPackage(packageInput(tag, 280_000));
  await page.goto(`/ops/packages/${pkg.id}`);
  await eventually(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Retry failed deliveries" })).toBeVisible({
      timeout: 2_000,
    });
  }, 8 * 60_000);
  return { pkg, tag };
}

test("a delivery the CRM outage set aside is retried from the console and the CRM catches up", async ({
  signedIn,
}) => {
  test.setTimeout(10 * 60_000);
  const { page } = await signedIn("ops");
  const { pkg, tag } = await packageWithSetAsideCrmUpdate(signedIn, page);

  await test.step("the CRM update needs attention after its last try", async () => {
    await page.goto("/ops/deliveries");
    const setAside = page
      .getByRole("row")
      .filter({ has: page.locator(`a[href="/ops/packages/${pkg.id}"]`) })
      .filter({ hasText: "CRM" });
    await expect(setAside.first()).toContainText("Needs attention");
    await page.goto("/ops/crm");
    const row = page.getByRole("row").filter({ hasText: street(tag) });
    await expect(row.getByText("Out of sync", { exact: true })).toBeVisible();
  });

  await test.step("with the CRM back, a retry from the console sends it", async () => {
    await page.goto("/ops/simulations");
    await tick(page.getByRole("radiogroup", { name: "CRM mode" }), /^Up/, "radio");
    await page.goto(`/ops/packages/${pkg.id}`);
    const retry = page.getByRole("button", { name: "Retry failed deliveries" });
    await retry.click();
    // Nothing is set aside any more, so the button (and its confirmation, see the fixme) goes.
    await expect(retry).toBeHidden();
    await page.goto("/ops/crm");
    const row = page.getByRole("row").filter({ hasText: street(tag) });
    await eventually(async () => {
      await page.reload();
      await expect(row.getByText("In sync", { exact: true })).toBeVisible({ timeout: 2_000 });
    });
    await page.goto("/ops/deliveries?status=SENT");
    const sent = page
      .getByRole("row")
      .filter({ has: page.locator(`a[href="/ops/packages/${pkg.id}"]`) })
      .filter({ hasText: "CRM" });
    await expect(sent.first()).toContainText("Sent");
  });
});

// Product bug found by this suite: on a package's trace, "Retry failed deliveries" never shows its
// confirmation ("N deliveries queued to retry."). The confirmation lives inside BulkActions, which
// the trace page renders only while stats.needsAttention > 0
// (apps/web/src/app/(ops)/ops/packages/[id]/page.tsx); the retry resets those deliveries, the
// refetched trace has none set aside, and the component unmounts with its message. The retry
// itself works (the test above). The deliveries page keeps its "Retry all" mounted and is fine.
test.fixme("a retry from a package's trace confirms what it queued", async ({ signedIn }) => {
  test.setTimeout(10 * 60_000);
  const { page } = await signedIn("ops");
  await packageWithSetAsideCrmUpdate(signedIn, page);
  await page.getByRole("button", { name: "Retry failed deliveries" }).click();
  await expect(page.getByRole("status").filter({ hasText: /queued to retry/ })).toBeVisible();
});
