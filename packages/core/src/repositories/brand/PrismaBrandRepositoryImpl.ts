// The brand port over Prisma (T348): the only file with Brand queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { BrandRecord, IBrandRepository } from "./IBrandRepository.js";

export class PrismaBrandRepositoryImpl implements IBrandRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  list() {
    return this.db.brand.findMany({
      select: { id: true, name: true, hosts: true },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string): Promise<BrandRecord | null> {
    return this.db.brand.findUnique({
      where: { id },
      select: { id: true, name: true, hosts: true, tokens: true, content: true, tokenVersion: true },
    });
  }

  async updateTokens(id: string, tokens: unknown): Promise<number> {
    const row = await this.db.brand.update({
      where: { id },
      data: { tokens: tokens as Prisma.InputJsonValue, tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    return row.tokenVersion;
  }
}
