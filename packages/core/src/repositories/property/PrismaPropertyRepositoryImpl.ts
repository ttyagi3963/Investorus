// The property port over Prisma (T119): the only file with Property queries.
import type { Property } from "@clever/contracts/property";
import type { Prisma } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { IPropertyRepository, NewProperty, PropertyPatch } from "./IPropertyRepository.js";
import { toPrismaPropertyCreate, toPrismaPropertyUpdate, toProperty } from "./property.mapper.js";

export class PrismaPropertyRepositoryImpl implements IPropertyRepository {
  constructor(
    private readonly db: Prisma.TransactionClient,
    private readonly cipher: IPiiCipher,
  ) {}

  async create(property: NewProperty): Promise<Property> {
    const data = toPrismaPropertyCreate(property, this.cipher);
    return toProperty(await this.db.property.create({ data }), this.cipher);
  }

  async findById(id: string): Promise<Property | null> {
    const row = await this.db.property.findUnique({ where: { id } });
    return row ? toProperty(row, this.cipher) : null;
  }

  async findByIds(ids: string[]): Promise<Map<string, Property>> {
    const rows = await this.db.property.findMany({ where: { id: { in: ids } } });
    return new Map(rows.map((row) => [row.id, toProperty(row, this.cipher)]));
  }

  async update(id: string, patch: PropertyPatch): Promise<Property> {
    const data = toPrismaPropertyUpdate(patch, this.cipher);
    return toProperty(await this.db.property.update({ where: { id }, data }), this.cipher);
  }
}
