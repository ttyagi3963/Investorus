// PostgreSQL through Prisma (T276): the one place the Prisma client is created for an app, wrapped
// as the database port: the unit of work, a health check, and disconnect.
import { InfrastructureError } from "../errors/InfrastructureError.js";
import { createPrismaClient } from "../infra/prisma-client.js";
import type { IPiiCipher } from "../providers/pii-cipher/IPiiCipher.js";
import type { IDatabase } from "./IDatabase.js";
import type { IUnitOfWork } from "./IUnitOfWork.js";
import { PrismaUnitOfWorkImpl } from "./PrismaUnitOfWorkImpl.js";

export class PostgresDatabaseImpl implements IDatabase {
  readonly uow: IUnitOfWork;
  private readonly prisma: ReturnType<typeof createPrismaClient>;

  constructor(databaseUrl: string, cipher: IPiiCipher) {
    this.prisma = createPrismaClient(databaseUrl);
    this.uow = new PrismaUnitOfWorkImpl(this.prisma, cipher);
  }

  async check(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (cause) {
      throw new InfrastructureError("The database did not answer", 503, cause);
    }
  }

  dispose(): Promise<void> {
    return this.prisma.$disconnect();
  }
}
