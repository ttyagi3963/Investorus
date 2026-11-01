// The config port over Prisma (T308): the only file with ConfigEntry queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IConfigRepository } from "./IConfigRepository.js";

export class PrismaConfigRepositoryImpl implements IConfigRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async findValue(key: string): Promise<unknown> {
    const row = await this.db.configEntry.findUnique({ where: { key } });
    return row?.value ?? null;
  }
}
