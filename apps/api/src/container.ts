// The api's composition root (T255, constitution I): the one place adapters are built and wired.
// Everything is created once from validated settings; `dispose` closes the database pool on
// shutdown. Swapping a vendor (S3 storage, T274) is a change here and nowhere else.
import {
  AuthService,
  InfrastructureError,
  ListingPackageService,
  PhotoService,
  type IAuthService,
  type IErrorReporter,
  type IListingPackageService,
  type IPhotoService,
} from "@clever/core";
import {
  AesGcmPiiCipherImpl,
  LogErrorReporterImpl,
  PrismaUnitOfWorkImpl,
  SandboxStorageProviderImpl,
  StaticGeoProviderImpl,
  SystemClockImpl,
  createAddressHasher,
  createLogger,
  createPrismaClient,
} from "@clever/core/adapters";
import type { Logger } from "pino";
import type { ApiEnv } from "./env.js";

export type AppContainer = Readonly<{
  auth: IAuthService;
  packages: IListingPackageService;
  photos: IPhotoService;
  photoUrl: (storageKey: string) => string;
  checkDatabase: () => Promise<void>;
  logger: Logger;
  reporter: IErrorReporter;
  dispose: () => Promise<void>;
}>;

export function createContainer(env: ApiEnv): AppContainer {
  const logger = createLogger("api", { level: env.LOG_LEVEL });
  const prisma = createPrismaClient(env.DATABASE_URL);
  const clock = new SystemClockImpl();
  const uow = new PrismaUnitOfWorkImpl(prisma, new AesGcmPiiCipherImpl(env.PII_ENCRYPTION_KEY));
  const storage = new SandboxStorageProviderImpl({
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
    photoUrl: (storageKey: string) => storage.getReadUrl(storageKey),
    checkDatabase: async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (cause) {
        throw new InfrastructureError("The database did not answer", 503, cause);
      }
    },
    logger,
    reporter: new LogErrorReporterImpl(logger),
    dispose: () => prisma.$disconnect(),
  });
}
