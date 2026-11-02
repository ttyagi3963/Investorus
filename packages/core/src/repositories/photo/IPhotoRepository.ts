// The photo port (T248): the rows for a package's uploaded images; the images themselves are in
// the storage provider under `storageKey`.
import type { Photo } from "@clever/contracts/photo";

export type NewPhoto = Omit<Photo, "id" | "createdAt">;

export interface IPhotoRepository {
  add(photo: NewPhoto): Promise<Photo>;
  listByPackage(packageId: string): Promise<Photo[]>;
  /** Each package's photos, in position order, in one query (T396); a package with none is absent. */
  listByPackages(packageIds: string[]): Promise<Map<string, Photo[]>>;
  /** Returns false when the package has no such photo. */
  remove(packageId: string, photoId: string): Promise<boolean>;
}
