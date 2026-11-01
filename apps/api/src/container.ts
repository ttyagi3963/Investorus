// The api's composition root (T255, constitution I): the one place adapters are built and wired.
// Everything is created once from validated settings; `dispose` closes the database pool on
// shutdown. Swapping a vendor is a change here and nowhere else: the database is one line (any
// IDatabase, T276), and STORAGE_PROVIDER picks the sandbox or S3 behind the storage port (T275).
import {
  AuthService,
  ListingPackageService,
  PhotoService,
  type IAuthService,
  type IErrorReporter,
  type IIdempotencyStore,
  type IListingPackageService,
  type IPhotoService,
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

export type AppContainer = Readonly<{
  auth: IAuthService;
  packages: IListingPackageService;
  photos: IPhotoService;
  /** A package's view, with each photo's short-lived read link signed. */
  presentPackage: (parts: AgentPackageParts) => Promise<AgentPackageView>;
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

  return Object.freeze({
    auth: new AuthService(uow, { jwtSecret: env.JWT_SECRET, clock }),
    packages: new ListingPackageService(uow, {
      geo: new StaticGeoProviderImpl(),
      addressHash: createAddressHasher(env.ADDRESS_HASH_KEY),
      clock,
    }),
    photos: new PhotoService(uow, storage),
    presentPackage: async (parts) =>
      toAgentPackageView({
        ...parts,
        photos: await Promise.all(
          parts.photos.map(async (photo) => ({
            ...photo,
            url: await storage.getReadUrl(photo.storageKey),
          })),
        ),
      }),
    checkDatabase: () => db.check(),
    idempotency: db.idempotency,
    logger,
    reporter: new LogErrorReporterImpl(logger),
    dispose: () => db.dispose(),
  });
}
