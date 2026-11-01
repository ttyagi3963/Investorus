// A storage stand-in for service tests: `objects` holds what was "uploaded", so a test decides what
// `stat` finds without a sandbox.
import type { UploadInstruction } from "@clever/contracts/photo";
import type {
  IStorageProvider,
  StoredObject,
} from "../../src/providers/storage/IStorageProvider.js";

export class FakeStorageProvider implements IStorageProvider {
  readonly objects = new Map<string, StoredObject>();
  readonly uploads: { key: string; contentType: string; maxBytes: number }[] = [];

  createUpload(key: string, contentType: string, maxBytes: number): UploadInstruction {
    this.uploads.push({ key, contentType, maxBytes });
    return {
      url: `https://storage.test/${key}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: "2026-11-01T12:10:00.000Z",
    };
  }

  getReadUrl(key: string): string {
    return `https://storage.test/${key}?read`;
  }

  async stat(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }
}
