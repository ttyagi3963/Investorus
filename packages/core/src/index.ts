// Public API of @clever/core: ports, services, workflows, domain types, errors.
// Never export *Impl classes here; they go in adapters.ts (research R22).
export { InfrastructureError } from "./errors/InfrastructureError.js";
export { redactPii } from "./errors/redact-pii.js";
export { translateError, type ErrorBody } from "./errors/http-error-translator.js";
export { currentTraceId, runWithTrace } from "./infra/trace-context.js";
export type { IErrorReporter } from "./providers/error-reporter/IErrorReporter.js";
export type { AddressHasher, IPiiCipher } from "./providers/pii-cipher/IPiiCipher.js";
export type { IClock } from "./providers/clock/IClock.js";
export type { IGeoProvider, ZipInfo } from "./providers/geo/IGeoProvider.js";
export type { IStorageProvider, StoredObject } from "./providers/storage/IStorageProvider.js";
export type { IDatabase } from "./unit-of-work/IDatabase.js";
export type { IUnitOfWork, UnitOfWorkRepositories } from "./unit-of-work/IUnitOfWork.js";
export type { IUserRepository } from "./repositories/user/IUserRepository.js";
export type { IAuditRepository, NewAuditEntry } from "./repositories/audit/IAuditRepository.js";
export type {
  ISellerRepository,
  NewSeller,
  SellerPatch,
} from "./repositories/seller/ISellerRepository.js";
export type {
  IPropertyRepository,
  NewProperty,
  PropertyPatch,
} from "./repositories/property/IPropertyRepository.js";
export type {
  IListingPackageRepository,
  ListingPackagePatch,
  NewListingPackage,
} from "./repositories/listing-package/IListingPackageRepository.js";
export type { IPhotoRepository, NewPhoto } from "./repositories/photo/IPhotoRepository.js";
export { AuthService, type IAuthService } from "./services/auth/AuthService.js";
export {
  ListingPackageService,
  type AgentPackage,
  type IListingPackageService,
} from "./services/listing-package/ListingPackageService.js";
export { PhotoService, type IPhotoService } from "./services/photo/PhotoService.js";
