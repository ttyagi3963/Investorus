// Public API of @clever/contracts/photo. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  type Photo,
  type PhotoContentType,
  type PhotoUpload,
  type UploadInstruction,
} from "./photo.js";
export {
  addPhotoInputSchema,
  createPhotoUploadInputSchema,
  type AddPhotoInput,
  type CreatePhotoUploadInput,
} from "./inputs.js";
