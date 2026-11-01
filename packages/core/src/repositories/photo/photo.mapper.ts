// Maps a database Photo row to the domain type, the only place the row type appears
// (constitution IV). The Photo_contentType_check guarantees the type is one of the allowed three.
import { PHOTO_CONTENT_TYPES, type Photo, type PhotoContentType } from "@clever/contracts/photo";
import type { Photo as PhotoRow } from "../../generated/prisma/client.js";

const isContentType = (value: string): value is PhotoContentType =>
  (PHOTO_CONTENT_TYPES as readonly string[]).includes(value);

export function toPhoto(row: PhotoRow): Photo {
  if (!isContentType(row.contentType)) throw new Error(`Photo ${row.id} has an unknown type`);
  return {
    id: row.id,
    packageId: row.packageId,
    storageKey: row.storageKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    position: row.position,
    createdAt: row.createdAt,
  };
}
