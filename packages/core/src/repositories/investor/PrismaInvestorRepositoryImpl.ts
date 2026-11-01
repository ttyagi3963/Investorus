// The investor port over Prisma (T308, T322): the only file with Investor queries. An email or
// external reference another investor already has comes back from the unique index as one
// BusinessRuleError, which the import reports on that row.
import { BusinessRuleError } from "@clever/contracts/common";
import { Prisma } from "../../generated/prisma/client.js";
import type { IInvestorRepository, InvestorFields } from "./IInvestorRepository.js";

export class PrismaInvestorRepositoryImpl implements IInvestorRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async findCompanyNames(ids: string[]): Promise<Map<string, string>> {
    const rows = await this.db.investor.findMany({
      where: { id: { in: ids } },
      select: { id: true, companyName: true },
    });
    return new Map(rows.map((row) => [row.id, row.companyName]));
  }

  async findIdForImport(externalRef: string | null, email: string): Promise<string | null> {
    const byRef =
      externalRef === null
        ? null
        : await this.db.investor.findUnique({ where: { externalRef }, select: { id: true } });
    const found =
      byRef ?? (await this.db.investor.findUnique({ where: { email }, select: { id: true } }));
    return found?.id ?? null;
  }

  async save(id: string | null, investor: InvestorFields): Promise<string> {
    try {
      const row =
        id === null
          ? await this.db.investor.create({ data: investor, select: { id: true } })
          : await this.db.investor.update({ where: { id }, data: investor, select: { id: true } });
      return row.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new BusinessRuleError(
          "Email or Investor ID belongs to another investor",
          "INVESTOR_EXISTS",
        );
      }
      throw err;
    }
  }
}
