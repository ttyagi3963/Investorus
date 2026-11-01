// The unit of work over Prisma (T043, T249): one interactive transaction per `run`, with every
// repository bound to that transaction, so all of a change's writes commit or roll back together.
import type { PrismaClient } from "../generated/prisma/client.js";
import type { IPiiCipher } from "../providers/pii-cipher/IPiiCipher.js";
import { PrismaAuditRepositoryImpl } from "../repositories/audit/PrismaAuditRepositoryImpl.js";
import { PrismaBuyBoxRepositoryImpl } from "../repositories/buy-box/PrismaBuyBoxRepositoryImpl.js";
import { PrismaJobRepositoryImpl } from "../repositories/job/PrismaJobRepositoryImpl.js";
import { PrismaListingPackageRepositoryImpl } from "../repositories/listing-package/PrismaListingPackageRepositoryImpl.js";
import { PrismaListingVersionRepositoryImpl } from "../repositories/listing-version/PrismaListingVersionRepositoryImpl.js";
import { PrismaMatchRepositoryImpl } from "../repositories/match/PrismaMatchRepositoryImpl.js";
import { PrismaNotificationRepositoryImpl } from "../repositories/notification/PrismaNotificationRepositoryImpl.js";
import { PrismaOfferRepositoryImpl } from "../repositories/offer/PrismaOfferRepositoryImpl.js";
import { PrismaPhotoRepositoryImpl } from "../repositories/photo/PrismaPhotoRepositoryImpl.js";
import { PrismaPropertyRepositoryImpl } from "../repositories/property/PrismaPropertyRepositoryImpl.js";
import { PrismaSellerRepositoryImpl } from "../repositories/seller/PrismaSellerRepositoryImpl.js";
import { PrismaUserRepositoryImpl } from "../repositories/user/PrismaUserRepositoryImpl.js";
import type { IUnitOfWork, UnitOfWorkRepositories } from "./IUnitOfWork.js";

export class PrismaUnitOfWorkImpl implements IUnitOfWork {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cipher: IPiiCipher,
  ) {}

  run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) =>
      work({
        users: new PrismaUserRepositoryImpl(tx),
        sellers: new PrismaSellerRepositoryImpl(tx, this.cipher),
        properties: new PrismaPropertyRepositoryImpl(tx, this.cipher),
        packages: new PrismaListingPackageRepositoryImpl(tx),
        photos: new PrismaPhotoRepositoryImpl(tx),
        audit: new PrismaAuditRepositoryImpl(tx),
        buyBoxes: new PrismaBuyBoxRepositoryImpl(tx),
        listingVersions: new PrismaListingVersionRepositoryImpl(tx),
        matches: new PrismaMatchRepositoryImpl(tx),
        notifications: new PrismaNotificationRepositoryImpl(tx),
        offers: new PrismaOfferRepositoryImpl(tx),
        jobs: new PrismaJobRepositoryImpl(tx),
      }),
    );
  }
}
