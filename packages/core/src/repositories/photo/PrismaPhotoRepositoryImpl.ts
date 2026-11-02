// The photo port over Prisma (T248): the only file with Photo queries.
import type { Photo } from "@clever/contracts/photo";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IPhotoRepository, NewPhoto } from "./IPhotoRepository.js";
import { toPhoto } from "./photo.mapper.js";

export class PrismaPhotoRepositoryImpl implements IPhotoRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async add(photo: NewPhoto): Promise<Photo> {
    return toPhoto(await this.db.photo.create({ data: photo }));
  }

  async listByPackage(packageId: string): Promise<Photo[]> {
    const rows = await this.db.photo.findMany({
      where: { packageId },
      orderBy: { position: "asc" },
    });
    return rows.map(toPhoto);
  }

  async listByPackages(packageIds: string[]): Promise<Map<string, Photo[]>> {
    const byPackage = new Map<string, Photo[]>();
    if (packageIds.length === 0) return byPackage;
    const rows = await this.db.photo.findMany({
      where: { packageId: { in: packageIds } },
      orderBy: { position: "asc" },
    });
    for (const photo of rows.map(toPhoto)) {
      byPackage.set(photo.packageId, [...(byPackage.get(photo.packageId) ?? []), photo]);
    }
    return byPackage;
  }

  async remove(packageId: string, photoId: string): Promise<boolean> {
    const { count } = await this.db.photo.deleteMany({ where: { id: photoId, packageId } });
    return count > 0;
  }
}
