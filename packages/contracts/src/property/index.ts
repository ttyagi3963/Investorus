// Public API of @clever/contracts/property. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  PROPERTY_CONDITIONS,
  PROPERTY_TYPES,
  type PropertyCondition,
  type PropertyType,
} from "./enums.js";
export type { Property } from "./property.js";
export { createPropertyInputSchema, type CreatePropertyInput } from "./inputs.js";
