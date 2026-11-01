// The photo rules (T124): the agent asks for an upload link, the browser uploads straight to
// storage, then the agent attaches it. Attaching trusts storage, not the browser: the type and size
// recorded are what storage holds, the key must belong to this package, and a package has at most
// 20 photos, one per position.
import { randomUUID } from "node:crypto";
import type { Actor } from "@clever/contracts/auth";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@clever/contracts/common";
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

const MAX_PHOTOS = 20;
const keyField = (message: string) =>
  new ValidationError(message, [{ field: "storageKey", message }]);
const isAllowed = (type: string): type is PhotoContentType =>
  (PHOTO_CONTENT_TYPES as readonly string[]).includes(type);

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
    const agentId = this.agentOf(actor);
    const { contentType, sizeBytes } = createPhotoUploadInputSchema.parse(input);
    await this.uow.run(async (repos) => {
      await this.ownPackage(repos, agentId, packageId);
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
    const agentId = this.agentOf(actor);
    const { storageKey, position } = addPhotoInputSchema.parse(input);
    await this.uow.run((repos) => this.ownPackage(repos, agentId, packageId));
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
    return this.uow.run(async (repos) => {
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
    const agentId = this.agentOf(actor);
    await this.uow.run(async (repos) => {
      await this.ownPackage(repos, agentId, packageId);
      if (!(await repos.photos.remove(packageId, photoId)))
        throw new NotFoundError("Photo not found");
    });
  }

  private agentOf(actor: Actor): string {
    if (actor.role !== "AGENT") throw new ForbiddenError("Only agents work on listing packages");
    return actor.agentId;
  }

  private async ownPackage(repos: UnitOfWorkRepositories, agentId: string, packageId: string) {
    if (!(await repos.packages.findForAgent(agentId, packageId))) {
      throw new NotFoundError("Package not found");
    }
  }
}
