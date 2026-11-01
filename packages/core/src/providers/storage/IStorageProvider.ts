// The storage port (T250, contracts/providers.md): signed links the browser uploads to and reads
// from directly (the api never proxies file bytes, constitution XIV), and `stat` so the api can
// check an upload before trusting it.
import type { UploadInstruction } from "@clever/contracts/photo";

export type StoredObject = { contentType: string; sizeBytes: number };

export interface IStorageProvider {
  /** A link that accepts one upload of `key` with this content type, up to `maxBytes`, briefly. */
  createUpload(key: string, contentType: string, maxBytes: number): UploadInstruction;
  /** A short-lived link to read `key`. */
  getReadUrl(key: string): string;
  /** The stored object's type and size, or null if nothing was uploaded under `key`. */
  stat(key: string): Promise<StoredObject | null>;
}
