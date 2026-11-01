// Storage on the sandbox (T251). Links are HMAC-SHA256 signed with STORAGE_SIGNING_KEY over
// "<METHOD>\n<key>\n<contentType>\n<sizeBytes>\n<exp>" (contracts/providers.md), the same string
// the sandbox checks, so a link cannot be reused for another object, type, size, or time; the sandbox
// accepts exactly that many bytes, as S3 does.
import { createHmac } from "node:crypto";
import type { UploadInstruction } from "@clever/contracts/photo";
import { z } from "zod";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { IClock } from "../clock/IClock.js";
import { sandboxRequest } from "../sandbox-http.js";
import type { IStorageProvider, StoredObject } from "./IStorageProvider.js";

const UPLOAD_SECONDS = 10 * 60;
const READ_SECONDS = 60 * 60;

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

  async getReadUrl(key: string): Promise<string> {
    const exp = this.expiry(READ_SECONDS);
    return `${this.objectUrl(key)}?exp=${exp}&sig=${this.sign("GET", key, "", 0, exp)}`;
  }

  async stat(key: string): Promise<StoredObject | null> {
    const res = await sandboxRequest(this.fetch, this.internalObjectUrl(key), {
      method: "HEAD",
      headers: { "x-sandbox-token": this.options.internalToken },
    });
    if (res.status === 404) return null;
    if (!res.ok)
      throw new InfrastructureError(`The sandbox refused a storage check (${res.status})`, 502);
    const parsed = statHeaders.safeParse({
      contentType: res.headers.get("content-type"),
      sizeBytes: res.headers.get("content-length"),
    });
    if (!parsed.success)
      throw new InfrastructureError("The sandbox sent a malformed storage check", 502);
    return parsed.data;
  }

  async read(key: string): Promise<Buffer | null> {
    const res = await sandboxRequest(this.fetch, this.internalObjectUrl(key), {
      method: "GET",
      headers: { "x-sandbox-token": this.options.internalToken },
    });
    if (res.status === 404) return null;
    if (!res.ok)
      throw new InfrastructureError(`The sandbox refused a storage read (${res.status})`, 502);
    return Buffer.from(await res.arrayBuffer());
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
