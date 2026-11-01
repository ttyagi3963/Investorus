// The api's composition root (T255, constitution I): the one place adapters are built and wired.
// Everything is created once from validated settings; `dispose` closes the database pool on
// shutdown. Swapping a vendor is a change here and nowhere else: the database is one line (any
// IDatabase, T276), and STORAGE_PROVIDER picks the sandbox or S3 behind the storage port (T275).
import {
  AuthService,
  BuyBoxService,
  DealLifecycleWorkflow,
  DecisionWorkflow,
  InvestorImportWorkflow,
  InvestorPackageQueryService,
  ListingPackageService,
  NotificationService,
  OfferComparisonService,
  OfferService,
  PhotoService,
  PublicationWorkflow,
  type IAuthService,
  type IBuyBoxService,
  type IDealLifecycleWorkflow,
  type IDecisionWorkflow,
  type IErrorReporter,
  type IIdempotencyStore,
  type IInvestorImportWorkflow,
  type IInvestorPackageQueryService,
  type IListingPackageService,
  type INotificationService,
  type IOfferComparisonService,
  type IOfferService,
  type IPhotoService,
  type IPublicationWorkflow,
} from "@clever/core";
import {
  AesGcmPiiCipherImpl,
  LogErrorReporterImpl,
  PostgresDatabaseImpl,
  S3StorageProviderImpl,
  SandboxStorageProviderImpl,
  StaticGeoProviderImpl,
  SystemClockImpl,
  createAddressHasher,
  createLogger,
} from "@clever/core/adapters";
import {
  toAgentPackageView,
  type AgentPackageParts,
  type AgentPackageView,
} from "@clever/contracts/listing-package";
import type { Logger } from "pino";
import type { ApiEnv } from "./env.js";
import type { AddPhotoUrls } from "./routes/investor.router.js";

export type AppContainer = Readonly<{
  auth: IAuthService;
  packages: IListingPackageService;
  photos: IPhotoService;
  publication: IPublicationWorkflow;
  investorPackages: IInvestorPackageQueryService;
  offers: IOfferService;
  comparison: IOfferComparisonService;
  decisions: IDecisionWorkflow;
  deals: IDealLifecycleWorkflow;
  notifications: INotificationService;
  buyBoxes: IBuyBoxService;
  investorImports: IInvestorImportWorkflow;
  /** A package's view, with each photo's public address. */
  presentPackage: (parts: AgentPackageParts) => AgentPackageView;
  /** Each photo with its public address. */
  addPhotoUrls: AddPhotoUrls;
  checkDatabase: () => Promise<void>;
  /** The Idempotency-Key store every POST and PATCH goes through (T285). */
  idempotency: IIdempotencyStore;
  logger: Logger;
  reporter: IErrorReporter;
  dispose: () => Promise<void>;
}>;

export function createContainer(env: ApiEnv): AppContainer {
  const logger = createLogger("api", { level: env.LOG_LEVEL });
  const db = new PostgresDatabaseImpl(
    env.DATABASE_URL,
    new AesGcmPiiCipherImpl(env.PII_ENCRYPTION_KEY),
  );
  const { uow } = db;
  const clock = new SystemClockImpl();
  const storage =
    env.STORAGE_PROVIDER === "s3"
      ? new S3StorageProviderImpl({
          bucket: env.S3_BUCKET,
          region: env.S3_REGION,
          clock,
        })
      : new SandboxStorageProviderImpl({
          publicUrl: env.PUBLIC_SANDBOX_URL,
          internalUrl: env.SANDBOX_URL,
          signingKey: env.STORAGE_SIGNING_KEY,
          internalToken: env.SANDBOX_INTERNAL_TOKEN,
          clock,
        });

  const geo = new StaticGeoProviderImpl();

  const addPhotoUrls: AddPhotoUrls = (photos) =>
    photos.map((photo) => ({ ...photo, url: storage.getPublicUrl(photo.storageKey) }));

  return Object.freeze({
    auth: new AuthService(uow, { jwtSecret: env.JWT_SECRET, clock }),
    packages: new ListingPackageService(uow, {
      geo,
      addressHash: createAddressHasher(env.ADDRESS_HASH_KEY),
      clock,
    }),
    photos: new PhotoService(uow, storage),
    publication: new PublicationWorkflow(uow, { clock }),
    investorPackages: new InvestorPackageQueryService(uow),
    offers: new OfferService(uow, { clock }),
    comparison: new OfferComparisonService(uow, { clock }),
    decisions: new DecisionWorkflow(uow, { clock }),
    deals: new DealLifecycleWorkflow(uow, { clock }),
    notifications: new NotificationService(uow, { clock }),
    buyBoxes: new BuyBoxService(uow, { geo }),
    investorImports: new InvestorImportWorkflow(uow, { storage, geo, clock }),
    presentPackage: (parts) => toAgentPackageView({ ...parts, photos: addPhotoUrls(parts.photos) }),
    addPhotoUrls,
    checkDatabase: () => db.check(),
    idempotency: db.idempotency,
    logger,
    reporter: new LogErrorReporterImpl(logger),
    dispose: () => db.dispose(),
  });
}
