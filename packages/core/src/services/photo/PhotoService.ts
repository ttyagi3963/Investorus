// The photo rules (T124): the agent asks for an upload link, the browser uploads straight to
// storage, then the agent attaches it. Attaching trusts storage, not the browser: the type and size
// recorded are what storage holds, the file's first bytes must match that type (T384), the key
// must belong to this package, and a package has at most 20 photos, one per position. Photos change
// only while the package is editable, and a published package keeps at least one (T375, FR-012).
// Removing a photo that is already gone is done, so a retried DELETE succeeds (T392).
import { randomUUID } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import { BusinessRuleError, NotFoundError, ValidationError } from "@clever/contracts/common";
import {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  addPhotoInputSchema,
  createPhotoUploadInputSchema,
  type Photo,
  type PhotoContentType,
  type PhotoUpload,
} from "@clever/contracts/photo";
import type { IStorageProvider } from "../../providers/storage/IStorageProvider.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { agentOf } from "../actor-guards.js";
import { assertEditable } from "../listing-package/publish-rules.js";

const AGENTS_ONLY = "Only agents work on listing packages";
const MAX_PHOTOS = 20;
const keyField = (message: string) =>
  new ValidationError(message, [{ field: "storageKey", message }]);
const isAllowed = (type: string): type is PhotoContentType =>
  (PHOTO_CONTENT_TYPES as readonly string[]).includes(type);

/** How each allowed image type's file begins (its magic bytes), checked on the first 12 bytes. */
const HEAD_BYTES = 12;
const STARTS_AS: Record<PhotoContentType, (head: Buffer) => boolean> = {
  "image/jpeg": (head) => head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
  "image/png": (head) =>
    head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  "image/webp": (head) =>
    head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP",
};

export interface IPhotoService {
  requestUpload(actor: Actor, packageId: string, input: unknown): Promise<PhotoUpload>;
  attach(actor: Actor, packageId: string, input: unknown): Promise<Photo>;
  remove(actor: Actor, packageId: string, photoId: string): Promise<void>;
}

export class PhotoService implements IPhotoService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly storage: IStorageProvider,
  ) {}

  async requestUpload(actor: Actor, packageId: string, input: unknown): Promise<PhotoUpload> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const { contentType, sizeBytes } = createPhotoUploadInputSchema.parse(input);
    await this.uow.run(async (repos) => {
      await this.editablePackage(repos, agentId, packageId);
      if ((await repos.photos.listByPackage(packageId)).length >= MAX_PHOTOS) {
        throw new BusinessRuleError(
          `A package can have at most ${MAX_PHOTOS} photos`,
          "PHOTO_LIMIT",
        );
      }
    });
    const storageKey = `packages/${packageId}/${randomUUID()}`;
    // The link accepts only the declared type and exact size, so the upload cannot be swapped.
    const upload = await this.storage.createUpload(storageKey, contentType, sizeBytes);
    return { storageKey, upload };
  }

  async attach(actor: Actor, packageId: string, input: unknown): Promise<Photo> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    const { storageKey, position } = addPhotoInputSchema.parse(input);
    await this.uow.run((repos) => this.editablePackage(repos, agentId, packageId));
    if (!storageKey.startsWith(`packages/${packageId}/`)) {
      throw keyField("This upload belongs to another package");
    }
    const stored = await this.storage.stat(storageKey);
    if (!stored) throw keyField("Upload the file before attaching it");
    if (
      !isAllowed(stored.contentType) ||
      stored.sizeBytes < 1 ||
      stored.sizeBytes > MAX_PHOTO_BYTES
    ) {
      throw keyField("Use a JPEG, PNG, or WebP image up to 10 MB");
    }
    const contentType = stored.contentType;
    // The browser named the type; the bytes must agree, or the "photo" is something else (T384).
    const head = await this.storage.readHead(storageKey, HEAD_BYTES);
    if (!head) throw keyField("Upload the file before attaching it");
    if (!STARTS_AS[contentType](head)) {
      throw keyField("This file is not the image type it claims to be");
    }
    return this.uow.run(async (repos) => {
      // Checked again: the status may have changed while storage was asked.
      await this.editablePackage(repos, agentId, packageId);
      const photos = await repos.photos.listByPackage(packageId);
      if (photos.length >= MAX_PHOTOS) {
        throw new BusinessRuleError(
          `A package can have at most ${MAX_PHOTOS} photos`,
          "PHOTO_LIMIT",
        );
      }
      if (photos.some((p) => p.position === position)) {
        throw new BusinessRuleError(
          "Another photo is already in this position",
          "PHOTO_POSITION_TAKEN",
        );
      }
      return repos.photos.add({
        packageId,
        storageKey,
        contentType,
        sizeBytes: stored.sizeBytes,
        position,
      });
    });
  }

  async remove(actor: Actor, packageId: string, photoId: string): Promise<void> {
    const agentId = agentOf(actor, AGENTS_ONLY);
    await this.uow.run(async (repos) => {
      const pkg = await this.editablePackage(repos, agentId, packageId);
      const photos = await repos.photos.listByPackage(packageId);
      // Already gone, as when a DELETE is retried after its answer was lost: done, not a 404
      // (T392). Checked before PHOTO_REQUIRED, so the retry never meets that rule.
      if (!photos.some((p) => p.id === photoId)) return;
      if (pkg.status !== "DRAFT" && photos.length === 1) {
        throw new BusinessRuleError(
          "A published package needs at least one photo; add another before removing this one",
          "PHOTO_REQUIRED",
        );
      }
      await repos.photos.remove(packageId, photoId);
    });
  }

  /** The agent's own package, held until the change ends so its status and photo count hold. */
  private async editablePackage(repos: UnitOfWorkRepositories, agentId: string, packageId: string) {
    await repos.packages.lock(packageId);
    const pkg = await repos.packages.findForAgent(agentId, packageId);
    if (!pkg) throw new NotFoundError("Package not found");
    assertEditable(pkg);
    return pkg;
  }
}
