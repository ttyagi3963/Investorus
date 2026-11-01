// The seller port over Prisma (T246): the only file with Seller queries.
import type { Seller } from "@clever/contracts/seller";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { ISellerRepository, NewSeller, SellerPatch } from "./ISellerRepository.js";
import { toPrismaSeller, toSeller } from "./seller.mapper.js";

export class PrismaSellerRepositoryImpl implements ISellerRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly cipher: IPiiCipher,
  ) {}

  async create(seller: NewSeller): Promise<Seller> {
    const data = {
      ...toPrismaSeller(seller, this.cipher),
      fullName: this.cipher.encrypt(seller.fullName),
    };
    return toSeller(await this.db.seller.create({ data }), this.cipher);
  }

  async findById(id: string): Promise<Seller | null> {
    const row = await this.db.seller.findUnique({ where: { id } });
    return row ? toSeller(row, this.cipher) : null;
  }

  async update(id: string, patch: SellerPatch): Promise<Seller> {
    const row = await this.db.seller.update({
      where: { id },
      data: toPrismaSeller(patch, this.cipher),
    });
    return toSeller(row, this.cipher);
  }
}
