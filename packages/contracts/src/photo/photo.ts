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

/**
 * How the browser uploads a photo (contracts/providers.md, vendor-neutral): it sends the file with
 * `fetch(url, { method, headers, body })` straight to storage, never through the api or the BFF.
 */
export type UploadInstruction = {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  /** ISO time; after it, ask for a new instruction. */
  expiresAt: string;
};

/** The answer to POST /listing-packages/:id/photo-uploads: the key to attach, and how to upload. */
export type PhotoUpload = { storageKey: string; upload: UploadInstruction };
