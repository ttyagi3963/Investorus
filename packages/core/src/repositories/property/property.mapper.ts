// Maps between the Property domain type and its database row: the street is encrypted on the way in
// and decrypted on the way out, and `baths` turns from a database decimal into a number. The only
// place the row type or the ciphertext is seen (constitution IV, XII).
import type { Property } from "@clever/contracts/property";
import type { Property as PropertyRow } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { NewProperty, PropertyPatch } from "./IPropertyRepository.js";

export function toProperty(row: PropertyRow, cipher: IPiiCipher): Property {
  return {
    id: row.id,
    streetLine: cipher.decrypt(row.streetLine),
    zip: row.zip,
    city: row.city,
    state: row.state,
    neighborhood: row.neighborhood,
    propertyType: row.propertyType,
    beds: row.beds,
    baths: row.baths === null ? null : row.baths.toNumber(),
    sqft: row.sqft,
    lotSqft: row.lotSqft,
    units: row.units,
    yearBuilt: row.yearBuilt,
    condition: row.condition,
    repairEstimate: row.repairEstimate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPrismaPropertyCreate(property: NewProperty, cipher: IPiiCipher) {
  return { ...property, streetLine: cipher.encrypt(property.streetLine) };
}

/** Encrypts the street if it changes. Prisma leaves a field that is `undefined` unchanged. */
export function toPrismaPropertyUpdate(patch: PropertyPatch, cipher: IPiiCipher) {
  const { streetLine, ...rest } = patch;
  return streetLine === undefined ? rest : { ...rest, streetLine: cipher.encrypt(streetLine) };
}
