// The investor port over Prisma (T308): the only file with Investor queries.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IInvestorRepository } from "./IInvestorRepository.js";

export class PrismaInvestorRepositoryImpl implements IInvestorRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async findCompanyNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.db.investor.findMany({
      where: { id: { in: ids } },
      select: { id: true, companyName: true },
    });
    return new Map(rows.map((row) => [row.id, row.companyName]));
  }
}
