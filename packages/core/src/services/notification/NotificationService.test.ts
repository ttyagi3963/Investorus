// Guards the inbox rule (T297): a user lists and marks read only their own notifications; another
// user's notification is "not found".
import { describe, expect, it } from "vitest";
import { investor, world } from "../../../test/fixtures/published-package.js";
import { NotificationService } from "./NotificationService.js";

describe("NotificationService", () => {
  it("lists and marks read only the user's own notifications", async () => {
    const { uow, clock } = world();
    for (const userId of ["user-summit", "user-harbor"]) {
      await uow.repos.notifications.create({
        userId,
        type: "PACKAGE_MATCHED",
        packageId: null,
        title: "A new listing matches your buy box",
        body: "A listing in Austin, TX 78704 matches Austin flips.",
      });
    }
    const inbox = new NotificationService(uow, { clock });
    const [mine] = await inbox.listMine(investor("summit"));
    expect(mine).toMatchObject({ userId: "user-summit", readAt: null });

    await inbox.markRead(investor("summit"), mine!.id);
    expect((await inbox.listMine(investor("summit")))[0]!.readAt).not.toBeNull();
    await expect(inbox.markRead(investor("harbor"), mine!.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
