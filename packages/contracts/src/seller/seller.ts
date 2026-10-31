// The Seller the app passes around, shaped from the Prisma `Seller` model with its contact fields
// decrypted (the repository mapper decrypts them). A plain type: sellers come from our database.

export type Seller = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
};
