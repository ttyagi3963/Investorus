// The unit of work (T043): a service runs every write of one change inside `run`, which commits all
// of them or none (constitution IV). Each repository a service may use is listed here.
import type { IAuditRepository } from "../repositories/audit/IAuditRepository.js";
import type { IListingPackageRepository } from "../repositories/listing-package/IListingPackageRepository.js";
import type { IPhotoRepository } from "../repositories/photo/IPhotoRepository.js";
import type { IPropertyRepository } from "../repositories/property/IPropertyRepository.js";
import type { ISellerRepository } from "../repositories/seller/ISellerRepository.js";
import type { IUserRepository } from "../repositories/user/IUserRepository.js";

export interface UnitOfWorkRepositories {
  users: IUserRepository;
  sellers: ISellerRepository;
  properties: IPropertyRepository;
  packages: IListingPackageRepository;
  photos: IPhotoRepository;
  audit: IAuditRepository;
}

export interface IUnitOfWork {
  run<T>(work: (repos: UnitOfWorkRepositories) => Promise<T>): Promise<T>;
}
