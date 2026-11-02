// Storage on the sandbox (T251, T326). Upload links are HMAC-SHA256 signed with STORAGE_SIGNING_KEY
// over "<METHOD>\n<key>\n<contentType>\n<sizeBytes>\n<exp>" (contracts/providers.md), the same
// string the sandbox checks, so a link cannot be reused for another object, type, size, or time;
// the sandbox accepts exactly that many bytes, as S3 does. Photos are read at a plain public address.
// An internal answer that does not name its object is garbled (garbage mode), an outage (T384).
import { createHmac } from "node:crypto";
import type { UploadInstruction } from "@clever/contracts/photo";
import { z } from "zod";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { IClock } from "../clock/IClock.js";
import { sandboxRequest } from "../sandbox-http.js";
import type { IStorageProvider, StoredObject } from "./IStorageProvider.js";
import { readLimited } from "./read-limited.js";

const UPLOAD_SECONDS = 10 * 60;

const statHeaders = z.object({
  contentType: z.string().min(1),
  sizeBytes: z.coerce.number().int().nonnegative(),
});

export type SandboxStorageOptions = {
  /** PUBLIC_SANDBOX_URL: what the browser reaches. */
  publicUrl: string;
  /** SANDBOX_URL: what the api reaches on the container network. */
  internalUrl: string;
  signingKey: string;
  internalToken: string;
  clock: IClock;
  fetch?: typeof globalThis.fetch;
};

export class SandboxStorageProviderImpl implements IStorageProvider {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: SandboxStorageOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadInstruction> {
    const exp = this.expiry(UPLOAD_SECONDS);
    const sig = this.sign("PUT", key, contentType, sizeBytes, exp);
    return {
      url: `${this.objectUrl(key)}?size=${sizeBytes}&exp=${exp}&sig=${sig}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  getPublicUrl(key: string): string {
    return this.objectUrl(key);
  }

  async stat(key: string): Promise<StoredObject | null> {
    const res = await this.objectRequest(key, "HEAD");
    if (!res) return null;
    const parsed = statHeaders.safeParse({
      contentType: res.headers.get("content-type"),
      sizeBytes: res.headers.get("content-length"),
    });
    if (!parsed.success)
      throw new InfrastructureError("The sandbox sent a malformed storage check", 502);
    return parsed.data;
  }

  async read(key: string, maxBytes: number): Promise<Buffer | null> {
    const res = await this.objectRequest(key, "GET");
    if (!res) return null;
    const tooLarge = () =>
      new InfrastructureError(`The sandbox holds more than ${maxBytes} bytes under a key`, 502);
    if (Number(res.headers.get("content-length")) > maxBytes) {
      await res.body?.cancel();
      throw tooLarge();
    }
    const { bytes, more } = await this.body(res, maxBytes);
    if (more) throw tooLarge();
    return bytes;
  }

  async readHead(key: string, bytes: number): Promise<Buffer | null> {
    const res = await this.objectRequest(key, "GET");
    return res && (await this.body(res, bytes)).bytes;
  }

  /**
   * The sandbox's answer about the stored object, or null when nothing is stored. Only the real
   * route names the object it answers for, so a 200 without that (garbage mode) is an outage.
   */
  private async objectRequest(key: string, method: "GET" | "HEAD"): Promise<Response | null> {
    const res = await sandboxRequest(this.fetch, this.internalObjectUrl(key), {
      method,
      headers: { "x-sandbox-token": this.options.internalToken },
    });
    if (res.status === 404) return null;
    if (!res.ok)
      throw new InfrastructureError(`The sandbox refused a storage ${method} (${res.status})`, 502);
    if (res.headers.get("x-object-key") !== encodeURIComponent(key)) {
      await res.body?.cancel();
      throw new InfrastructureError("The sandbox sent a garbled storage answer", 502);
    }
    return res;
  }

  /** The body up to `limit` bytes; the 5 s timeout also covers this, and ends it as an outage. */
  private async body(res: Response, limit: number) {
    if (!res.body) return { bytes: Buffer.alloc(0), more: false };
    try {
      return await readLimited(res.body, limit);
    } catch (cause) {
      throw new InfrastructureError("The sandbox stopped sending a stored object", 503, cause);
    }
  }

  private internalObjectUrl(key: string): string {
    return `${this.options.internalUrl}/internal/storage/objects/${encodeURIComponent(key)}`;
  }

  private objectUrl(key: string): string {
    return `${this.options.publicUrl}/storage/objects/${encodeURIComponent(key)}`;
  }

  private expiry(seconds: number): number {
    return Math.floor(this.options.clock.now().getTime() / 1000) + seconds;
  }

  private sign(method: string, key: string, contentType: string, sizeBytes: number, exp: number) {
    return createHmac("sha256", this.options.signingKey)
      .update(`${method}\n${key}\n${contentType}\n${sizeBytes}\n${exp}`)
      .digest("hex");
  }
}
