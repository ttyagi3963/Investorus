// Maps between the Seller domain type and its database row, encrypting the contact fields on the
// way in and decrypting them on the way out: the only place either the row type or the ciphertext
// is seen (constitution IV, XII).
import type { Seller } from "@clever/contracts/seller";
import type { Seller as SellerRow } from "../../generated/prisma/client.js";
import type { IPiiCipher } from "../../providers/pii-cipher/IPiiCipher.js";
import type { SellerPatch } from "./ISellerRepository.js";

export function toSeller(row: SellerRow, cipher: IPiiCipher): Seller {
  return {
    id: row.id,
    fullName: cipher.decrypt(row.fullName),
    email: row.email === null ? null : cipher.decrypt(row.email),
    phone: row.phone === null ? null : cipher.decrypt(row.phone),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Encrypts each field that changes. Prisma leaves a field that is `undefined` unchanged. */
export function toPrismaSeller(patch: SellerPatch, cipher: IPiiCipher) {
  const seal = (v: string | null | undefined) => (v == null ? v : cipher.encrypt(v));
  return {
    fullName: seal(patch.fullName) ?? undefined,
    email: seal(patch.email),
    phone: seal(patch.phone),
  };
}
