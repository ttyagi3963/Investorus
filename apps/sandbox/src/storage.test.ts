// Guards the sandbox storage rules (T252, T275, T372, T384): only a valid, unexpired link for that
// exact object, type, and size may upload (like a presigned S3 PUT), the internal routes need the
// shared token and name the object they answer for, only the listed web origins (every brand's
// address) may upload from the browser, a served photo can never run as a page, and a cut-off
// sidecar file reads as no object instead of failing the request (T392).
import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { seedPhotos, storageCors, storageRoutes } from "./storage.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const config = {
  storageDir: mkdtempSync(join(tmpdir(), "sandbox-storage-")),
  signingKey: "signing-key",
  internalToken: "internal-token",
  webOrigins: ["http://localhost:3000", "http://partner.localhost:3000"],
  now: () => NOW,
};
// The storage routes alone: the outage gate in front of them needs the database (app.int.test.ts).
const app = express().use(storageCors(config.webOrigins), storageRoutes(config));

/** A signed upload path, as SandboxStorageProviderImpl builds it. */
function uploadPath(
  key: string,
  contentType: string,
  size: number,
  exp = NOW.getTime() / 1000 + 600,
) {
  const sig = createHmac("sha256", config.signingKey)
    .update(`PUT\n${key}\n${contentType}\n${size}\n${exp}`)
    .digest("hex");
  return `/storage/objects/${encodeURIComponent(key)}?size=${size}&exp=${exp}&sig=${sig}`;
}

const jpeg = Buffer.alloc(2_000, 1);

describe("sandbox storage", () => {
  it("stores the seed photos once under packages/seed/ and serves them like any listing photo (T420)", async () => {
    const photosDir = mkdtempSync(join(tmpdir(), "seed-photos-"));
    writeFileSync(join(photosDir, "la-01.webp"), Buffer.from("first photo"));
    await seedPhotos(config.storageDir, photosDir);
    const served = await request(app)
      .get(`/storage/objects/${encodeURIComponent("packages/seed/la-01.webp")}`)
      .expect(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(Buffer.from(served.body as Buffer).toString()).toBe("first photo");

    // Loading again (every sandbox start does) leaves a stored photo as it is.
    writeFileSync(join(photosDir, "la-01.webp"), Buffer.from("changed on disk"));
    await seedPhotos(config.storageDir, photosDir);
    const again = await request(app)
      .get(`/storage/objects/${encodeURIComponent("packages/seed/la-01.webp")}`)
      .expect(200);
    expect(Buffer.from(again.body as Buffer).toString()).toBe("first photo");
  });

  it("accepts an upload only with a valid link for that object, type, and exact size", async () => {
    const path = uploadPath("packages/p1/a.jpg", "image/jpeg", 2_000);
    await request(app).put(path).set("Content-Type", "image/jpeg").send(jpeg).expect(200);

    const forged = path.replace(/sig=[0-9a-f]+/, `sig=${"0".repeat(64)}`);
    await request(app).put(forged).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    const expired = uploadPath("packages/p1/b.jpg", "image/jpeg", 2_000, NOW.getTime() / 1000 - 1);
    await request(app).put(expired).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    const otherObject = path.replace(
      encodeURIComponent("packages/p1/a.jpg"),
      encodeURIComponent("packages/p2/a.jpg"),
    );
    await request(app).put(otherObject).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    await request(app).put(path).set("Content-Type", "text/html").send(jpeg).expect(403);
    const smaller = uploadPath("packages/p1/c.jpg", "image/jpeg", 1_000);
    await request(app).put(smaller).set("Content-Type", "image/jpeg").send(jpeg).expect(413);
    const larger = uploadPath("packages/p1/e.jpg", "image/jpeg", 3_000);
    await request(app).put(larger).set("Content-Type", "image/jpeg").send(jpeg).expect(400);
  });

  it("allows a browser upload from every listed web origin, and from no other", async () => {
    const preflight = (origin: string) =>
      request(app)
        .options("/storage/objects/check")
        .set("Origin", origin)
        .set("Access-Control-Request-Method", "PUT")
        .expect(204);
    const partner = await preflight("http://partner.localhost:3000");
    expect(partner.headers["access-control-allow-origin"]).toBe("http://partner.localhost:3000");
    const other = await preflight("https://evil.example");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("serves a photo to anyone at its plain address, but nothing outside packages/", async () => {
    await request(app)
      .put(uploadPath("packages/p1/f.jpg", "image/jpeg", 2_000))
      .set("Content-Type", "image/jpeg")
      .send(jpeg)
      .expect(200);
    await request(app)
      .put(uploadPath("imports/i2.csv", "text/csv", 8))
      .set("Content-Type", "text/csv")
      .send("a,b\n1,2\n")
      .expect(200);

    const photo = await request(app)
      .get(`/storage/objects/${encodeURIComponent("packages/p1/f.jpg")}`)
      .expect(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    // Served as the stored type only, and never as a page that could run script (T384).
    expect(photo.headers["x-content-type-options"]).toBe("nosniff");
    expect(photo.headers["content-security-policy"]).toMatch(/default-src 'none'.*sandbox/);
    await request(app)
      .get(`/storage/objects/${encodeURIComponent("imports/i2.csv")}`)
      .expect(403);
  });

  it("reports a stored object's type and size on the internal route, only with the token", async () => {
    await request(app)
      .put(uploadPath("packages/p1/d.jpg", "image/jpeg", 2_000))
      .set("Content-Type", "image/jpeg")
      .send(jpeg)
      .expect(200);
    const internal = `/internal/storage/objects/${encodeURIComponent("packages/p1/d.jpg")}`;
    await request(app).head(internal).expect(401);
    const res = await request(app)
      .head(internal)
      .set("x-sandbox-token", "internal-token")
      .expect(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["content-length"]).toBe("2000");
    // Names the object, so an answer that is not about it (garbage mode) is seen as garbled (T384).
    expect(res.headers["x-object-key"]).toBe(encodeURIComponent("packages/p1/d.jpg"));
  });

  it("answers 404, not 500, for an object whose sidecar file was cut off mid-write (T392)", async () => {
    const key = "packages/p1/cut.jpg";
    const stored = join(config.storageDir, createHash("sha256").update(key).digest("hex"));
    writeFileSync(stored, jpeg);
    writeFileSync(`${stored}.json`, '{"contentType":"ima');
    await request(app)
      .get(`/storage/objects/${encodeURIComponent(key)}`)
      .expect(404);
  });

  it("returns a stored object's bytes on the internal route, only with the token", async () => {
    await request(app)
      .put(uploadPath("imports/i1.csv", "text/csv", 8))
      .set("Content-Type", "text/csv")
      .send("a,b\n1,2\n")
      .expect(200);
    const internal = `/internal/storage/objects/${encodeURIComponent("imports/i1.csv")}`;
    await request(app).get(internal).expect(401);
    const res = await request(app)
      .get(internal)
      .set("x-sandbox-token", "internal-token")
      .expect(200);
    expect(res.text).toBe("a,b\n1,2\n");
  });
});
