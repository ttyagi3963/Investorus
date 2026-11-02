// A storage outage reads as one (T411; T384): with the stand-in storage answering garbage, a photo
// upload from the page fails without attaching anything, and the api answers the attach of a file
// it can no longer read as an outage (5xx), not as the agent's mistake (a 4xx on the file). Its own
// Playwright project runs it after every other spec, since the outage would break any upload
// running beside it; every mode is set back to up whatever happens.
import { JPEG, packageInput, uniqueTag } from "../support/data.js";
import { expect, test, tick } from "../support/fixtures.js";

test.afterEach(async ({ signedIn }) => {
  const { bff } = await signedIn("ops");
  for (const service of ["crm", "messaging", "storage"] as const) {
    await bff.setSimulation(service, "up");
  }
});

test("a photo upload during a storage outage reports an outage, not a bad file", async ({
  signedIn,
}) => {
  const ops = await signedIn("ops");
  const agent = await signedIn("agent");
  const draft = await agent.bff.createPackage(packageInput(uniqueTag(), 250_000));
  // Uploaded while storage still works, to attach once it does not.
  const storedBefore = await agent.bff.uploadPhoto(draft.id);

  await ops.page.goto("/ops/simulations");
  await tick(ops.page.getByRole("radiogroup", { name: "File storage mode" }), /^Garbage/, "radio");

  await test.step("an upload from the page fails and attaches nothing", async () => {
    const { page } = agent;
    const refusals: number[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/bff/") && r.status() >= 400 && r.status() < 500) {
        refusals.push(r.status());
      }
    });
    await page.goto(`/agent/packages/${draft.id}`);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add photos" }).click();
    await (await chooser).setFiles(JPEG);
    const photos = page.getByRole("region", { name: "Photos" });
    await expect(photos.getByRole("alert")).not.toBeEmpty();
    await expect(photos.getByText("No photos yet.")).toBeVisible();
    expect(refusals, "nothing blames the agent's file").toEqual([]);
  });

  await test.step("the api answers a garbled storage read as an outage", async () => {
    const attach = await agent.bff.send("POST", `/listing-packages/${draft.id}/photos`, {
      storageKey: storedBefore,
      position: 0,
    });
    expect(attach.status(), await attach.text()).toBeGreaterThanOrEqual(500);
  });
});

// Product bug found by this suite: during a storage outage the page says only "Failed to fetch".
// The sandbox's outage gate answers before its CORS headers are set (apps/sandbox/src/app.ts), so
// the browser cannot read the answer and fetch throws a TypeError; usePhotoUpload shows any thrown
// Error's own message (apps/web/src/features/listing-package/usePhotoUpload.ts, errorText), which
// for a network failure is the browser's raw text instead of "front.jpg could not be uploaded. Try
// again."
test.fixme("a storage outage tells the agent to try the upload again", async ({ signedIn }) => {
  const ops = await signedIn("ops");
  const agent = await signedIn("agent");
  const draft = await agent.bff.createPackage(packageInput(uniqueTag(), 250_000));
  await ops.page.goto("/ops/simulations");
  await tick(ops.page.getByRole("radiogroup", { name: "File storage mode" }), /^Garbage/, "radio");
  await agent.page.goto(`/agent/packages/${draft.id}`);
  const chooser = agent.page.waitForEvent("filechooser");
  await agent.page.getByRole("button", { name: "Add photos" }).click();
  await (await chooser).setFiles(JPEG);
  await expect(agent.page.getByRole("region", { name: "Photos" }).getByRole("alert")).toContainText(
    "Try again",
  );
});
