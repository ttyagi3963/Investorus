// Guards the S3 storage rules (T274): an upload link is signed over the content type and the exact
// length, so the browser cannot change either; `stat` reads HeadObject and treats a 404 as "nothing
// uploaded"; and an S3 failure, or no answer within 5 s (T384), surfaces as an InfrastructureError.
// Signing runs offline with fake credentials, and `send` is stubbed, so no AWS account is touched.
import { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import { S3StorageProviderImpl } from "./S3StorageProviderImpl.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const setup = () => {
  const client = new S3Client({
    region: "us-west-1",
    credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "not-a-secret" },
  });
  const storage = new S3StorageProviderImpl({
    client,
    bucket: "listing-photos",
    region: "us-west-1",
    clock: { now: () => NOW },
  });
  return { client, storage };
};
const s3Error = (status: number) =>
  Object.assign(new Error(`S3 ${status}`), { $metadata: { httpStatusCode: status } });

describe("S3StorageProviderImpl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs an upload link over the content type and the exact length, for ten minutes", async () => {
    const { storage } = setup();

    const upload = await storage.createUpload("packages/p1/a", "image/jpeg", 2_000);

    const url = new URL(upload.url);
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
      expect.arrayContaining(["content-type", "content-length"]),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(upload).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      expiresAt: "2026-11-01T12:10:00.000Z",
    });
  });

  it("gives a photo the bucket's plain address, with no signature or expiry", () => {
    const { storage } = setup();

    expect(storage.getPublicUrl("packages/p1/a b")).toBe(
      "https://listing-photos.s3.us-west-1.amazonaws.com/packages/p1/a%20b",
    );
  });

  it("reads the stored type and size, and reports nothing uploaded on a 404", async () => {
    const { client, storage } = setup();
    const send = vi.spyOn(client, "send");

    send.mockResolvedValueOnce({ ContentType: "image/png", ContentLength: 2_000 } as never);
    await expect(storage.stat("packages/p1/a")).resolves.toEqual({
      contentType: "image/png",
      sizeBytes: 2_000,
    });
    send.mockRejectedValueOnce(s3Error(404) as never);
    await expect(storage.stat("packages/p1/missing")).resolves.toBeNull();
  });

  it("turns an S3 failure into an InfrastructureError", async () => {
    const { client, storage } = setup();
    vi.spyOn(client, "send").mockRejectedValue(s3Error(503) as never);

    await expect(storage.stat("packages/p1/a")).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("gives up on S3 after 5 s with an InfrastructureError", async () => {
    vi.useFakeTimers();
    const { client, storage } = setup();
    // S3 that never answers.
    vi.spyOn(client, "send").mockReturnValue(new Promise(() => {}) as never);

    const check = expect(storage.stat("packages/p1/a")).rejects.toBeInstanceOf(InfrastructureError);
    await vi.advanceTimersByTimeAsync(5_000);
    await check;
  });
});
