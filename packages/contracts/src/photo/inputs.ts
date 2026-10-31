// The two photo inputs (contracts/api.md): asking for an upload URL before the browser uploads
// the image, then attaching the uploaded image to the package at a position. Checked with Zod.
import { z } from "zod";
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES } from "./photo.js";

/** POST /listing-packages/:id/photo-uploads */
export const createPhotoUploadInputSchema = z.object({
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
});
export type CreatePhotoUploadInput = z.input<typeof createPhotoUploadInputSchema>;

/** POST /listing-packages/:id/photos */
export const addPhotoInputSchema = z.object({
  storageKey: z.string().min(1),
  position: z.number().int().min(0).max(19),
});
export type AddPhotoInput = z.input<typeof addPhotoInputSchema>;
