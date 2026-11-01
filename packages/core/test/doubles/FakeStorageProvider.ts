// A storage stand-in for service tests: `objects` holds what was "uploaded", so a test decides what
// `stat` finds without a sandbox, and `files` the bytes `read` returns.
import type { UploadInstruction } from "@clever/contracts/photo";
import type {
  IStorageProvider,
  StoredObject,
} from "../../src/providers/storage/IStorageProvider.js";

export class FakeStorageProvider implements IStorageProvider {
  readonly objects = new Map<string, StoredObject>();
  readonly files = new Map<string, Buffer>();
  readonly uploads: { key: string; contentType: string; sizeBytes: number }[] = [];

  async createUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<UploadInstruction> {
    this.uploads.push({ key, contentType, sizeBytes });
    return {
      url: `https://storage.test/${key}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: "2026-11-01T12:10:00.000Z",
    };
  }

  getPublicUrl(key: string): string {
    return `https://storage.test/${key}`;
  }

  async stat(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async read(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }
}
