// Adapter barrel (@clever/core/adapters): every *Impl, plus client factories.
// Lint allows importing it only from apps/*/src/container.ts (research R22).
export { createLogger } from "./infra/logger.js";
export { createPrismaClient } from "./infra/prisma-client.js";
export { LogErrorReporterImpl } from "./providers/error-reporter/LogErrorReporterImpl.js";
export { AesGcmPiiCipherImpl } from "./providers/pii-cipher/AesGcmPiiCipherImpl.js";
export { createAddressHasher } from "./providers/pii-cipher/address-hasher.js";
export { PrismaUnitOfWorkImpl } from "./unit-of-work/PrismaUnitOfWorkImpl.js";
