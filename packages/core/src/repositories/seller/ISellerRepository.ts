// The seller port (T246): services pass and receive plain values; encryption happens inside the
// repository, so ciphertext never leaves it (constitution XII).
import type { Seller } from "@clever/contracts/seller";

export type NewSeller = { fullName: string; email: string | null; phone: string | null };
export type SellerPatch = Partial<NewSeller>;

export interface ISellerRepository {
  create(seller: NewSeller): Promise<Seller>;
  findById(id: string): Promise<Seller | null>;
  update(id: string, patch: SellerPatch): Promise<Seller>;
}
