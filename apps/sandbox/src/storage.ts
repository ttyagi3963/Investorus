// The stand-in object storage (T252; contracts/providers.md). The browser uploads and reads with
// links signed by core's SandboxStorageProviderImpl over "<METHOD>\n<key>\n<type>\n<max>\n<exp>";
// the api checks an upload on the internal route with the shared token. Objects are files on the
// SANDBOX_STORAGE_DIR volume, named by a hash of the key so no key can reach outside it.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Router, type Request, type Response } from "express";

export type StorageConfig = {
  storageDir: string;
  signingKey: string;
  internalToken: string;
  webOrigin: string;
  now: () => Date;
};

type Meta = { contentType: string; sizeBytes: number };

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function storageRoutes(config: StorageConfig): Router {
  const router = Router();
  const file = (key: string) =>
    join(config.storageDir, createHash("sha256").update(key).digest("hex"));
  const readMeta = async (key: string): Promise<Meta | null> =>
    JSON.parse(await readFile(`${file(key)}.json`, "utf8").catch(() => "null")) as Meta | null;

  /** True when the link is unexpired and its signature covers exactly this request. */
  const signed = (req: Request, method: string, contentType: string, max: number) => {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");
    if (!Number.isInteger(exp) || exp * 1000 < config.now().getTime()) return false;
    const expected = createHmac("sha256", config.signingKey)
      .update(`${method}\n${String(req.params.key)}\n${contentType}\n${max}\n${exp}`)
      .digest("hex");
    return sameSecret(sig, expected);
  };

  // The browser uploads cross-origin (port 3000 to 4100), so only WEB_ORIGIN gets CORS headers.
  router.use("/storage/objects", (req, res, next) => {
    if (req.headers.origin === config.webOrigin) {
      res.set("Access-Control-Allow-Origin", config.webOrigin);
      res.set("Access-Control-Allow-Methods", "PUT, GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return void res.status(204).end();
    next();
  });

  router.put("/storage/objects/:key", async (req, res: Response) => {
    const max = Number(req.query.max);
    const contentType = req.headers["content-type"] ?? "";
    if (!Number.isInteger(max) || !signed(req, "PUT", contentType, max)) {
      return void res.status(403).json({ error: "Invalid or expired upload link" });
    }
    if (Number(req.headers["content-length"] ?? 0) > max) {
      return void res.status(413).json({ error: "File too large" });
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > max) return void res.status(413).json({ error: "File too large" });
      chunks.push(chunk);
    }
    const key = String(req.params.key);
    await writeFile(file(key), Buffer.concat(chunks));
    await writeFile(
      `${file(key)}.json`,
      JSON.stringify({ contentType, sizeBytes: size } satisfies Meta),
    );
    res.status(200).json({ ok: true });
  });

  router.get("/storage/objects/:key", async (req, res) => {
    if (!signed(req, "GET", "", 0))
      return void res.status(403).json({ error: "Invalid or expired link" });
    const key = String(req.params.key);
    const meta = await readMeta(key);
    if (!meta) return void res.status(404).json({ error: "Not found" });
    res
      .status(200)
      .type(meta.contentType)
      .send(await readFile(file(key)));
  });

  router.head("/internal/storage/objects/:key", async (req, res) => {
    if (!sameSecret(String(req.headers["x-sandbox-token"] ?? ""), config.internalToken)) {
      return void res.status(401).end();
    }
    const meta = await readMeta(String(req.params.key));
    if (!meta) return void res.status(404).end();
    res.set("Content-Type", meta.contentType).set("Content-Length", String(meta.sizeBytes));
    res.status(200).end();
  });

  return router;
}
