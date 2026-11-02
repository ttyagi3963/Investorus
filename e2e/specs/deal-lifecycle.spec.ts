// A deal from two offers to a reconfirmed backup (T411; FR-044, FR-052, FR-055 to FR-058, T377):
// the agent moves the deadline close, the worker closes the round when it passes, the agent counters
// one offer after the deadline, that investor answers with a revision, and the agent accepts it.
// The milestones advance only in order; the deal falls through with a reason; the backup is
// promoted and reconfirms. A shorter test reopens a fallen-through package instead.
import type { Page } from "@playwright/test";
import type { DealView } from "@clever/contracts/deal";
import type { NotificationView } from "@clever/contracts/notification";
import type { OfferView } from "@clever/contracts/offer";
import type { Bff } from "../support/bff.js";
import { buyBoxInput, offerTerms, packageInput, uniqueTag } from "../support/data.js";
import {
  eventually,
  expect,
  localInput,
  test,
  waitForMatch,
  type Session,
} from "../support/fixtures.js";

const MINUTE = 60_000;

/** The comparison's "Seller's decision" cell in the column whose offer price is `price`. */
async function decisionFor(page: Page, price: string) {
  const priceRow = page.getByRole("row", { name: /^Offer price/ });
  await expect(priceRow, `an offer of ${price} is on the comparison`).toContainText(price);
  const column = (await priceRow.getByRole("cell").allInnerTexts()).findIndex((text) =>
    text.includes(price),
  );
  return page
    .getByRole("row", { name: /^Seller's decision/ })
    .getByRole("cell")
    .nth(column);
}

/** A published package matched to two investors, each with an offer; the first offer is higher. */
async function packageWithTwoOffers(
  agent: Session,
  first: Session,
  second: Session,
  offerDeadline?: Date,
) {
  const tag = uniqueTag();
  for (const investor of [first, second]) {
    await investor.bff.createBuyBox(buyBoxInput(`E2E deal ${tag}`, 250_000, 300_000));
  }
  const pkg = await agent.bff.publishedPackage(packageInput(tag, 280_000), offerDeadline);
  await waitForMatch(first.bff, pkg.id);
  await waitForMatch(second.bff, pkg.id);
  const higher = await first.bff.makeOffer(pkg.id, offerTerms(265_000));
  const lower = await second.bff.makeOffer(pkg.id, offerTerms(262_000));
  return { pkg, higher, lower };
}

async function offerOf(agent: Bff, packageId: string, offerId: string): Promise<OfferView> {
  const offer = (await agent.packageOffers(packageId)).find((o) => o.id === offerId);
  if (!offer) throw new Error(`Offer ${offerId} is not on package ${packageId}`);
  return offer;
}

test("two offers become a deal that falls through to a reconfirmed backup", async ({
  signedIn,
}) => {
  test.setTimeout(8 * MINUTE);
  const agent = await signedIn("agent");
  const backupInvestor = await signedIn("investor");
  const buyer = await signedIn("secondInvestor");
  // A short first deadline, so the agent's extension can still end a minute or two from now.
  const { pkg, higher, lower } = await packageWithTwoOffers(
    agent,
    backupInvestor,
    buyer,
    new Date(Date.now() + 75_000),
  );
  const { page } = agent;

  await test.step("the agent extends the deadline to a minute or two from now", async () => {
    await page.goto(`/agent/packages/${pkg.id}`);
    await page.getByRole("button", { name: "Extend deadline" }).click();
    const dialog = page.getByRole("dialog");
    // The field holds whole minutes, so the next minute after 75 seconds from now.
    const deadline = new Date(Math.ceil((Date.now() + 75_000) / MINUTE) * MINUTE);
    await dialog.getByLabel("New offer deadline").fill(await localInput(page, deadline));
    await dialog.getByRole("button", { name: "Extend deadline" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Offer deadline extended")).toBeVisible();
  });

  await test.step("the worker closes the round once the deadline passes", async () => {
    await eventually(async () => {
      await page.reload();
      await expect(page.getByText("Offer deadline passed with 2 open offers")).toBeVisible({
        timeout: 2_000,
      });
    }, 4 * MINUTE);
  });

  await test.step("the agent counters the lower offer after the deadline", async () => {
    await page.goto(`/agent/packages/${pkg.id}/compare`);
    await (await decisionFor(page, "$262,000")).getByRole("button", { name: "Counter" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Price", { exact: true }).fill("268000");
    await dialog.getByRole("button", { name: "Send counter-offer" }).click();
    await expect(dialog).toBeHidden();
    expect(await offerOf(agent.bff, pkg.id, lower.id)).toMatchObject({ status: "COUNTERED" });
  });

  await test.step("that investor answers the counter with a revision (T377)", async () => {
    await buyer.page.goto(`/investor/packages/${pkg.id}`);
    await expect(buyer.page.getByText("The seller countered your offer")).toBeVisible();
    await buyer.page.getByLabel("Offer price").fill("266000");
    await buyer.page.getByRole("button", { name: "Send revision" }).click();
    // Past the deadline, an answered counter closes the form: the page states the offer instead.
    await expect(buyer.page.getByText("Your offer: $266,000 (Active).")).toBeVisible();
    expect(await offerOf(agent.bff, pkg.id, lower.id)).toMatchObject({
      status: "ACTIVE",
      price: 266_000,
    });
  });

  await test.step("the agent accepts the revised offer", async () => {
    await page.reload();
    await (await decisionFor(page, "$266,000")).getByRole("button", { name: "Accept" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, accept" }).click();
    await expect(page.getByRole("link", { name: "See the deal" })).toBeVisible();
    expect(await offerOf(agent.bff, pkg.id, higher.id)).toMatchObject({ status: "BACKUP" });
  });

  let deal: DealView;
  await test.step("milestones advance only in order", async () => {
    await page.goto(`/agent/packages/${pkg.id}/deal`);
    await expect(page.getByText("Offer accepted", { exact: true }).first()).toBeVisible();
    const moves = page.getByRole("button", { name: /^Move to/ });
    await expect(moves).toHaveText(["Move to under contract"]);
    deal = await agent.bff.deal(pkg.id);
    const skipped = await agent.bff.send("POST", `/deals/${deal.id}/milestones`, {
      milestone: "INSPECTION",
      version: deal.version,
    });
    expect(skipped.status(), "a skipped milestone is refused").toBe(409);
    await moves.click();
    await expect(moves).toHaveText(["Move to inspection"]);
    await expect(
      page.getByRole("list", { name: "Milestones" }).locator("[aria-current=step]"),
    ).toContainText("Under contract");
  });

  await test.step("the deal falls through, with a reason", async () => {
    await page.getByRole("button", { name: "Mark as fallen through" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Why it fell through").fill("Financing collapsed at underwriting");
    await dialog.getByRole("button", { name: "Mark fallen through" }).click();
    await expect(
      page.getByText("Reason it fell through: Financing collapsed at underwriting"),
    ).toBeVisible();
  });

  await test.step("the agent promotes the backup, who reconfirms", async () => {
    await page.getByRole("button", { name: "Promote" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, promote" }).click();
    await expect(page.getByText(/Waiting for .+ to reconfirm by/)).toBeVisible();

    await backupInvestor.page.goto(`/investor/packages/${pkg.id}`);
    await expect(backupInvestor.page.getByText("Your backup offer was chosen")).toBeVisible();
    await backupInvestor.page.getByRole("button", { name: "Reconfirm my offer" }).click();
    await expect(
      backupInvestor.page.getByText("Your offer was accepted. Deal status: Offer accepted."),
    ).toBeVisible();
    // Only now, as the buyer, does this investor see who is selling.
    await expect(
      backupInvestor.page.getByRole("heading", { name: "Seller contact" }),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText("Promoted from a backup offer.")).toBeVisible();
    await expect(page.getByText("$265,000", { exact: true })).toBeVisible();
    expect(await offerOf(agent.bff, pkg.id, higher.id)).toMatchObject({ status: "ACCEPTED" });
  });
});

test("after a fall-through the agent can reopen, declining the backups", async ({ signedIn }) => {
  const agent = await signedIn("agent");
  const first = await signedIn("investor");
  const second = await signedIn("secondInvestor");
  const { pkg, higher, lower } = await packageWithTwoOffers(agent, first, second);
  // The accepted deal and its fall-through are set up through the BFF; this test is the reopen.
  await agent.bff.call("POST", `/listing-packages/${pkg.id}/decisions`, {
    type: "ACCEPT",
    offerId: higher.id,
    version: (await offerOf(agent.bff, pkg.id, higher.id)).version,
  });
  const deal = await agent.bff.deal(pkg.id);
  await agent.bff.call("POST", `/deals/${deal.id}/fall-through`, {
    reason: "The buyer walked away",
    version: deal.version,
  });
  expect(await offerOf(agent.bff, pkg.id, lower.id)).toMatchObject({ status: "BACKUP" });

  const { page } = agent;
  await page.goto(`/agent/packages/${pkg.id}/deal`);
  await page.getByRole("button", { name: "Reopen for a new round" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reopen for a new round" }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/agent/packages/${pkg.id}`);
  await expect(page.getByText("Accepting offers", { exact: true })).toBeVisible();
  await expect(page.getByText(/Offer round 2/)).toBeVisible();
  // The new round lists only its own offers, so the declined backup shows in its investor's inbox.
  const notices = await second.bff.call<NotificationView[]>("GET", "/notifications");
  expect(notices).toContainEqual(
    expect.objectContaining({ packageId: pkg.id, title: "Your offer was declined" }),
  );
});
