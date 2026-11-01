// Adapter barrel (@clever/core/adapters): every *Impl, plus client factories.
// Lint allows importing it only from apps/*/src/container.ts (research R22).
export { createLogger } from "./infra/logger.js";
export { SystemClockImpl } from "./providers/clock/SystemClockImpl.js";
export { StaticGeoProviderImpl } from "./providers/geo/StaticGeoProviderImpl.js";
export { S3StorageProviderImpl } from "./providers/storage/S3StorageProviderImpl.js";
export { SandboxStorageProviderImpl } from "./providers/storage/SandboxStorageProviderImpl.js";
export { LogErrorReporterImpl } from "./providers/error-reporter/LogErrorReporterImpl.js";
export { AesGcmPiiCipherImpl } from "./providers/pii-cipher/AesGcmPiiCipherImpl.js";
export { createAddressHasher } from "./providers/pii-cipher/address-hasher.js";
export { PostgresDatabaseImpl } from "./unit-of-work/PostgresDatabaseImpl.js";
