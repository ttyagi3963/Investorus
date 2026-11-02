// The stand-in object storage (T252, T326; contracts/providers.md). The browser uploads with links
// signed by core's SandboxStorageProviderImpl over "<METHOD>\n<key>\n<type>\n<size>\n<exp>", and an
// upload must be exactly <size> bytes, as with a presigned S3 PUT. Photos (keys under packages/) are
// public, like the S3 bucket's policy; anything else, such as an import file, is not. The api checks
// an upload, and the worker reads an uploaded file, on the internal routes with the shared token.
// Objects are files on the SANDBOX_STORAGE_DIR volume, named by a hash of the key so no key can
// reach outside it, each written whole through a rename (T392). An outage mode for storage is
// applied in front of these routes (simulation.ts); the internal answers name their object
// (x-object-key), so core can tell a garbled one (T384).
import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Router, type Request, type Response } from "express";
import { sameSecret } from "./auth.js";

export type StorageConfig = {
  storageDir: string;
  signingKey: string;
  internalToken: string;
  /** The web app's origins, one per brand host, that may upload from the browser. */
  webOrigins: string[];
  now: () => Date;
};

type Meta = { contentType: string; sizeBytes: number };

/** Listing photos; the only objects anyone may read without the internal token. */
const PUBLIC_PREFIX = "packages/";

/** Served files are data: never sniffed into another type, never run as a page (T384). */
const SERVED_FILE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

/** Writes a temporary file and renames it into place, so no reader sees a half-written file. */
async function writeWhole(path: string, data: string | Buffer): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, data);
  await rename(temp, path);
}

export function storageRoutes(config: StorageConfig): Router {
  const router = Router();
  const file = (key: string) =>
    join(config.storageDir, createHash("sha256").update(key).digest("hex"));
  /** The sidecar, or null if there is none or a write interrupted before T392 cut it off. */
  const readMeta = async (key: string): Promise<Meta | null> => {
    const text = await readFile(`${file(key)}.json`, "utf8").catch(() => null);
    if (text === null) return null;
    try {
      return JSON.parse(text) as Meta;
    } catch {
      return null;
    }
  };

  /** True when the link is unexpired and its signature covers exactly this request. */
  const signed = (req: Request, method: string, contentType: string, size: number) => {
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");
    if (!Number.isInteger(exp) || exp * 1000 < config.now().getTime()) return false;
    const expected = createHmac("sha256", config.signingKey)
      .update(`${method}\n${String(req.params.key)}\n${contentType}\n${size}\n${exp}`)
      .digest("hex");
    return sameSecret(sig, expected);
  };

  // The browser uploads cross-origin (port 3000 to 4100), so only a listed web origin (WEB_ORIGIN)
  // gets CORS headers, naming that origin; the answer varies by Origin, so caches must not share it.
  router.use("/storage/objects", (req, res, next) => {
    res.vary("Origin");
    const origin = req.headers.origin;
    if (origin !== undefined && config.webOrigins.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Access-Control-Allow-Methods", "PUT, GET, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return void res.status(204).end();
    next();
  });

  router.put("/storage/objects/:key", async (req, res: Response) => {
    const expected = Number(req.query.size);
    const contentType = req.headers["content-type"] ?? "";
    if (!Number.isInteger(expected) || !signed(req, "PUT", contentType, expected)) {
      return void res.status(403).json({ error: "Invalid or expired upload link" });
    }
    const tooLarge = () => res.status(413).json({ error: "The file is larger than declared" });
    if (Number(req.headers["content-length"] ?? 0) > expected) return void tooLarge();
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > expected) return void tooLarge();
      chunks.push(chunk);
    }
    if (size !== expected) {
      return void res.status(400).json({ error: "The file is smaller than declared" });
    }
    const key = String(req.params.key);
    // The bytes first, then the sidecar that says they are there, each written whole (T392).
    await writeWhole(file(key), Buffer.concat(chunks));
    await writeWhole(
      `${file(key)}.json`,
      JSON.stringify({ contentType, sizeBytes: size } satisfies Meta),
    );
    res.status(200).json({ ok: true });
  });

  router.get("/storage/objects/:key", async (req, res) => {
    const key = String(req.params.key);
    if (!key.startsWith(PUBLIC_PREFIX)) return void res.status(403).json({ error: "Not public" });
    const meta = await readMeta(key);
    if (!meta) return void res.status(404).json({ error: "Not found" });
    res
      .status(200)
      .set(SERVED_FILE_HEADERS)
      .type(meta.contentType)
      .send(await readFile(file(key)));
  });

  // Registered before the GET below, which Express would otherwise also run for a HEAD.
  router.head("/internal/storage/objects/:key", async (req, res) => {
    if (!sameSecret(String(req.headers["x-sandbox-token"] ?? ""), config.internalToken)) {
      return void res.status(401).end();
    }
    const key = String(req.params.key);
    const meta = await readMeta(key);
    if (!meta) return void res.status(404).end();
    res.set("Content-Type", meta.contentType).set("Content-Length", String(meta.sizeBytes));
    res.set("x-object-key", encodeURIComponent(key)).status(200).end();
  });

  router.get("/internal/storage/objects/:key", async (req, res) => {
    if (!sameSecret(String(req.headers["x-sandbox-token"] ?? ""), config.internalToken)) {
      return void res.status(401).end();
    }
    const key = String(req.params.key);
    const meta = await readMeta(key);
    if (!meta) return void res.status(404).end();
    res
      .status(200)
      .set("x-object-key", encodeURIComponent(key))
      .type(meta.contentType)
      .send(await readFile(file(key)));
  });

  return router;
}
