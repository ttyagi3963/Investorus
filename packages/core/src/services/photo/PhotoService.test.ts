// Guards the photo rules (T113): an upload is trusted only after storage confirms it, with the type
// and size storage holds, never the browser's claim; a package cannot attach another package's
// upload; at most 20 photos, one per position; and only the owning agent can change them.
import type { Actor } from "@clever/contracts/auth";
import { BusinessRuleError, NotFoundError, ValidationError } from "@clever/contracts/common";
import { describe, expect, it } from "vitest";
import { FakeStorageProvider } from "../../../test/doubles/FakeStorageProvider.js";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import { PhotoService } from "./PhotoService.js";

const avery: Actor = { userId: "user-a", role: "AGENT", agentId: "agent-a" };
const blake: Actor = { userId: "user-b", role: "AGENT", agentId: "agent-b" };

async function setup() {
  const uow = new InMemoryUnitOfWork();
  const storage = new FakeStorageProvider();
  const pkg = await uow.repos.packages.create({
    agentId: "agent-a",
    sellerId: "seller-1",
    propertyId: "property-1",
    addressHash: "hash-1",
    priceExpectationMin: 300_000,
    priceExpectationMax: 350_000,
  });
  return { photos: new PhotoService(uow, storage), storage, packageId: pkg.id };
}

/** Requests an upload and pretends the browser stored `stored` under the returned key. */
async function upload(
  s: Awaited<ReturnType<typeof setup>>,
  stored = { contentType: "image/jpeg", sizeBytes: 2_000 },
) {
  const { storageKey } = await s.photos.requestUpload(avery, s.packageId, {
    contentType: "image/jpeg",
    sizeBytes: 2_000,
  });
  s.storage.objects.set(storageKey, stored);
  return storageKey;
}

describe("PhotoService", () => {
  it("records a photo with the type and size storage holds, and refuses one never uploaded", async () => {
    const s = await setup();
    const key = await upload(s);
    expect(s.storage.uploads[0]).toMatchObject({ key, sizeBytes: 2_000 });
    const photo = await s.photos.attach(avery, s.packageId, { storageKey: key, position: 0 });
    expect(photo).toMatchObject({ contentType: "image/jpeg", sizeBytes: 2_000, position: 0 });
    const { storageKey: never } = await s.photos.requestUpload(avery, s.packageId, {
      contentType: "image/png",
      sizeBytes: 10,
    });
    await expect(
      s.photos.attach(avery, s.packageId, { storageKey: never, position: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses a stored file of another type or over 10 MB, and another package's upload", async () => {
    const s = await setup();
    const gif = await upload(s, { contentType: "image/gif", sizeBytes: 2_000 });
    await expect(
      s.photos.attach(avery, s.packageId, { storageKey: gif, position: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    const huge = await upload(s, { contentType: "image/jpeg", sizeBytes: 10 * 1024 * 1024 + 1 });
    await expect(
      s.photos.attach(avery, s.packageId, { storageKey: huge, position: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    s.storage.objects.set("packages/other/x.jpg", { contentType: "image/jpeg", sizeBytes: 10 });
    await expect(
      s.photos.attach(avery, s.packageId, { storageKey: "packages/other/x.jpg", position: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows at most 20 photos, one per position", async () => {
    const s = await setup();
    await s.photos.attach(avery, s.packageId, { storageKey: await upload(s), position: 0 });
    const taken = s.photos.attach(avery, s.packageId, { storageKey: await upload(s), position: 0 });
    await expect(taken).rejects.toBeInstanceOf(BusinessRuleError);
    for (let position = 1; position < 20; position++) {
      await s.photos.attach(avery, s.packageId, { storageKey: await upload(s), position });
    }
    await expect(
      s.photos.requestUpload(avery, s.packageId, { contentType: "image/jpeg", sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("lets only the owning agent request, attach, or remove", async () => {
    const s = await setup();
    const key = await upload(s);
    const photo = await s.photos.attach(avery, s.packageId, { storageKey: key, position: 0 });
    await expect(
      s.photos.requestUpload(blake, s.packageId, { contentType: "image/jpeg", sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(s.photos.remove(blake, s.packageId, photo.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await s.photos.remove(avery, s.packageId, photo.id);
    await expect(s.photos.remove(avery, s.packageId, photo.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
