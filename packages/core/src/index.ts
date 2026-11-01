// Public API of @clever/core: ports, services, workflows, domain types, errors.
// Never export *Impl classes here; they go in adapters.ts (research R22).
export { InfrastructureError } from "./errors/InfrastructureError.js";
export { redactPii, scrubPiiText } from "./errors/redact-pii.js";
export { translateError, type ErrorBody } from "./errors/http-error-translator.js";
export { currentTraceId, runWithTrace } from "./infra/trace-context.js";
export type { IErrorReporter } from "./providers/error-reporter/IErrorReporter.js";
export type { AddressHasher, IPiiCipher } from "./providers/pii-cipher/IPiiCipher.js";
export type { IClock } from "./providers/clock/IClock.js";
export type { IGeoProvider, ZipInfo } from "./providers/geo/IGeoProvider.js";
export type { IStorageProvider, StoredObject } from "./providers/storage/IStorageProvider.js";
export type { IDatabase } from "./unit-of-work/IDatabase.js";
export type {
  IIdempotencyStore,
  IdempotencyClaim,
  IdempotencyRequest,
} from "./repositories/idempotency/IIdempotencyStore.js";
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
export {
  InvestorPackageQueryService,
  type IInvestorPackageQueryService,
  type InvestorPackage,
} from "./services/investor-package/InvestorPackageQueryService.js";
export { OfferService, type IOfferService } from "./services/offer/OfferService.js";
export { BuyBoxService, type IBuyBoxService } from "./services/buy-box/BuyBoxService.js";
export {
  OfferComparisonService,
  type ComparisonEntry,
  type IOfferComparisonService,
} from "./services/offer-comparison/OfferComparisonService.js";
export { DecisionWorkflow, type IDecisionWorkflow } from "./workflows/decision/DecisionWorkflow.js";
export {
  DealLifecycleWorkflow,
  type IDealLifecycleWorkflow,
} from "./workflows/deal-lifecycle/DealLifecycleWorkflow.js";
export {
  NotificationService,
  type INotificationService,
} from "./services/notification/NotificationService.js";
export {
  PublicationWorkflow,
  type IPublicationWorkflow,
} from "./workflows/publication/PublicationWorkflow.js";
export { MatchingWorkflow, type IMatchingWorkflow } from "./workflows/matching/MatchingWorkflow.js";
export {
  InvestorImportWorkflow,
  type IInvestorImportWorkflow,
} from "./workflows/investor-import/InvestorImportWorkflow.js";
export {
  OfferRoundWorkflow,
  type IOfferRoundWorkflow,
} from "./workflows/offer-round/OfferRoundWorkflow.js";
export { createJobHandlers, type JobHandler } from "./jobs/handlers.js";
export {
  DeliveryDispatcher,
  type DeliveryDispatcherDeps,
  type DispatchResult,
} from "./outbox/DeliveryDispatcher.js";
export { OutboxRelay, type RelayResult } from "./outbox/OutboxRelay.js";
export { readConfig } from "./repositories/config/read-config.js";
export type { IDeliveryConsumer, IDeliveryQueue } from "./providers/delivery-queue/IDeliveryQueue.js";
