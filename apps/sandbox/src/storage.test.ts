// Guards the sandbox storage rules (T252): only a valid, unexpired link for that exact object, type,
// and size limit may upload, and the internal routes need the shared token.
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const NOW = new Date("2026-11-01T12:00:00Z");
const config = {
  storageDir: mkdtempSync(join(tmpdir(), "sandbox-storage-")),
  signingKey: "signing-key",
  internalToken: "internal-token",
  webOrigin: "http://localhost:3000",
  now: () => NOW,
};
const app = createApp(config);

/** A signed upload path, as SandboxStorageProviderImpl builds it. */
function uploadPath(
  key: string,
  contentType: string,
  max: number,
  exp = NOW.getTime() / 1000 + 600,
) {
  const sig = createHmac("sha256", config.signingKey)
    .update(`PUT\n${key}\n${contentType}\n${max}\n${exp}`)
    .digest("hex");
  return `/storage/objects/${encodeURIComponent(key)}?max=${max}&exp=${exp}&sig=${sig}`;
}

const jpeg = Buffer.alloc(2_000, 1);

describe("sandbox storage", () => {
  it("accepts an upload only with a valid link for that object, type, and size", async () => {
    const path = uploadPath("packages/p1/a.jpg", "image/jpeg", 5_000);
    await request(app).put(path).set("Content-Type", "image/jpeg").send(jpeg).expect(200);

    const forged = path.replace(/sig=[0-9a-f]+/, `sig=${"0".repeat(64)}`);
    await request(app).put(forged).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    const expired = uploadPath("packages/p1/b.jpg", "image/jpeg", 5_000, NOW.getTime() / 1000 - 1);
    await request(app).put(expired).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    const otherObject = path.replace(
      encodeURIComponent("packages/p1/a.jpg"),
      encodeURIComponent("packages/p2/a.jpg"),
    );
    await request(app).put(otherObject).set("Content-Type", "image/jpeg").send(jpeg).expect(403);
    await request(app).put(path).set("Content-Type", "text/html").send(jpeg).expect(403);
    const small = uploadPath("packages/p1/c.jpg", "image/jpeg", 1_000);
    await request(app).put(small).set("Content-Type", "image/jpeg").send(jpeg).expect(413);
  });

  it("reports a stored object's type and size on the internal route, only with the token", async () => {
    await request(app)
      .put(uploadPath("packages/p1/d.jpg", "image/jpeg", 5_000))
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
  });
});
