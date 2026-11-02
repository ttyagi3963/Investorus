// A matched investor's offer, start to finish (T411; FR-040 to FR-043, XII, T381): the package page
// and its data never carry the seller's name, email, phone, or street; a double-clicked "Send offer"
// makes one offer; the investor revises it, then withdraws it, and the agent sees each change.
import { buyBoxInput, isoDate, packageInput, street, uniqueTag } from "../support/data.js";
import { expect, test, waitForMatch } from "../support/fixtures.js";

test("an investor makes one offer, revises it, and withdraws it", async ({ signedIn }) => {
  const tag = uniqueTag();
  const input = packageInput(tag, 260_000);
  const agent = await signedIn("agent");
  const { page, bff } = await signedIn("investor");
  await bff.createBuyBox(buyBoxInput(`E2E offers ${tag}`, 250_000, 270_000));
  const pkg = await agent.bff.publishedPackage(input);
  await waitForMatch(bff, pkg.id);
  const offers = () => agent.bff.packageOffers(pkg.id);

  await test.step("the listing shows no seller details or street (XII)", async () => {
    const data = page.waitForResponse((r) => r.url().endsWith(`/bff/investor/packages/${pkg.id}`));
    await page.goto(`/investor/packages/${pkg.id}`);
    const answer = await (await data).text();
    await expect(page.getByRole("heading", { name: "Home details" })).toBeVisible();
    const shown = await page.locator("body").innerText();
    for (const secret of [
      input.seller.fullName,
      input.seller.email!,
      input.seller.phone!,
      street(tag),
    ]) {
      expect(shown, "the page shows no seller detail or street").not.toContain(secret);
      expect(answer, "the BFF sends no seller detail or street").not.toContain(secret);
    }
  });

  await test.step("a double-clicked Send offer makes one offer (T381)", async () => {
    await page.getByLabel("Offer price").fill("255000");
    await page.getByLabel("Closing date").fill(isoDate(30));
    await page.getByRole("button", { name: "Send offer" }).dblclick();
    // "Your offer was sent." only flashes (see the fixme below); the revision line stays.
    await expect(page.getByText("You are on revision 1.")).toBeVisible();
    const made = await offers();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ price: 255_000, status: "ACTIVE", revision: 1 });
  });

  await test.step("the investor revises the offer", async () => {
    await page.getByLabel("Offer price").fill("258000");
    await page.getByRole("button", { name: "Send revision" }).click();
    await expect(page.getByText("You are on revision 2.")).toBeVisible();
    expect(await offers()).toEqual([
      expect.objectContaining({ price: 258_000, status: "ACTIVE", revision: 2 }),
    ]);
  });

  await test.step("the investor withdraws the offer", async () => {
    await page.getByRole("button", { name: "Withdraw my offer" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yes, withdraw" }).click();
    await expect(page.getByRole("button", { name: "Send offer" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw my offer" })).toBeHidden();
    expect(await offers()).toEqual([expect.objectContaining({ status: "WITHDRAWN" })]);
  });
});

// Product bug found by this suite: "Your offer was sent." disappears as soon as it appears.
// useOfferForm sets it and then refetches the package, whose offer now has a new version; the
// package page keys OfferForm on that version (apps/web/src/app/(investor)/investor/packages/[id]/
// page.tsx), so the form remounts and the confirmation is lost. The offer itself is saved.
test.fixme("an investor who sends an offer is told it was sent", async ({ signedIn }) => {
  const tag = uniqueTag();
  const agent = await signedIn("agent");
  const { page, bff } = await signedIn("investor");
  await bff.createBuyBox(buyBoxInput(`E2E sent ${tag}`, 250_000, 270_000));
  const pkg = await agent.bff.publishedPackage(packageInput(tag, 260_000));
  await waitForMatch(bff, pkg.id);
  await page.goto(`/investor/packages/${pkg.id}`);
  await page.getByLabel("Offer price").fill("255000");
  await page.getByLabel("Closing date").fill(isoDate(30));
  await page.getByRole("button", { name: "Send offer" }).click();
  // Once the page has reloaded the offer, the confirmation must still be there.
  await expect(page.getByText("You are on revision 1.")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Your offer was sent." })).toBeVisible();
});
