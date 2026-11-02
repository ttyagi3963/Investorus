// The storage port (T250, T275, T326, contracts/providers.md): signed links the browser uploads to
// directly (the api never proxies file bytes, constitution XIV), a photo's permanent public address,
// and `stat` so the api can check an upload before trusting it. Signing is async because S3 resolves
// its credentials. `read` is for the worker, which processes an uploaded file (the investor import);
// `readHead` lets the api check a photo's first bytes (T384).
import type { UploadInstruction } from "@clever/contracts/photo";

export type StoredObject = { contentType: string; sizeBytes: number };

export interface IStorageProvider {
  /** A link that accepts one upload of `key`, of exactly this type and size, briefly. */
  createUpload(key: string, contentType: string, sizeBytes: number): Promise<UploadInstruction>;
  /** The permanent address anyone can read a photo at (keys under `packages/` only). */
  getPublicUrl(key: string): string;
  /** The stored object's type and size, or null if nothing was uploaded under `key`. */
  stat(key: string): Promise<StoredObject | null>;
  /**
   * The stored bytes of `key`, or null if nothing was uploaded under it. An object larger than
   * `maxBytes` is refused (InfrastructureError) without being read whole.
   */
  read(key: string, maxBytes: number): Promise<Buffer | null>;
  /** The first `bytes` bytes of `key` (fewer if it is shorter), or null if nothing is there. */
  readHead(key: string, bytes: number): Promise<Buffer | null>;
}
