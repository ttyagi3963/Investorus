// The decision port over Prisma (T309): the only file with Decision queries. The note is encrypted
// on the way in and decrypted on the way out, so its plain text never reaches the database.
import type { Decision } from "@clever/contracts/deal";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { IDecisionRepository, NewDecision } from "./IDecisionRepository.js";

export class PrismaDecisionRepositoryImpl implements IDecisionRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly cipher: IPiiCipher,
  ) {}

  async append({ note, ...decision }: NewDecision): Promise<Decision> {
    const row = await this.db.decision.create({
      data: { ...decision, note: note === null ? null : this.cipher.encrypt(note) },
    });
    return { ...row, note: row.note === null ? null : this.cipher.decrypt(row.note) };
  }
}
