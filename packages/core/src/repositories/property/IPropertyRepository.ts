// The property port (T119): services pass plain values plus the address hash they computed for the
// duplicate check; the street is encrypted inside the repository (constitution XII).
import type { Property } from "@clever/contracts/property";

export type NewProperty = Omit<Property, "id" | "createdAt" | "updatedAt"> & {
  addressHash: string;
};
export type PropertyPatch = Partial<NewProperty>;

export interface IPropertyRepository {
  create(property: NewProperty): Promise<Property>;
  findById(id: string): Promise<Property | null>;
  /** Several properties in one query, by ID, for a list (T386). */
  findByIds(ids: string[]): Promise<Map<string, Property>>;
  update(id: string, patch: PropertyPatch): Promise<Property>;
}
