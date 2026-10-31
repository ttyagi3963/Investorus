// The Photo the app passes around, shaped from the Prisma `Photo` model, plus the image rules the
// table's CHECKs enforce, kept here so the upload input and the database agree.

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

/** 10 MB, the Photo_sizeBytes_check limit. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type Photo = {
  id: string;
  packageId: string;
  storageKey: string;
  contentType: PhotoContentType;
  sizeBytes: number;
  position: number;
  createdAt: Date;
};
