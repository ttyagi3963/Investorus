// The effect marker port over Prisma (T368): one INSERT ... ON CONFLICT DO NOTHING, so of two runs
// of the same job only one can record the key, even at the same moment.
import type { Prisma } from "../../generated/prisma/client.js";
import type { IEffectMarkerRepository } from "./IEffectMarkerRepository.js";

export class PrismaEffectMarkerRepositoryImpl implements IEffectMarkerRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async claimOnce(key: string): Promise<boolean> {
    const recorded = await this.db.$executeRaw`
      INSERT INTO "EffectMarker" (key) VALUES (${key}) ON CONFLICT (key) DO NOTHING`;
    return recorded === 1;
  }
}
