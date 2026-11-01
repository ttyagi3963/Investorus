// The user port over Prisma (T049): the only file with User queries.
import type { User, UserCredentials } from "@clever/contracts/user";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IUserRepository } from "./IUserRepository.js";
import { toUser } from "./user.mapper.js";

export class PrismaUserRepositoryImpl implements IUserRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async findByEmail(email: string): Promise<UserCredentials | null> {
    const row = await this.db.user.findUnique({ where: { email } });
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.user.findUnique({ where: { id } });
    return row ? toUser(row) : null;
  }

  async findIdByInvestorId(investorId: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { investorId }, select: { id: true } });
    return row?.id ?? null;
  }

  async findIdByAgentId(agentId: string): Promise<string | null> {
    const row = await this.db.user.findUnique({ where: { agentId }, select: { id: true } });
    return row?.id ?? null;
  }
}
