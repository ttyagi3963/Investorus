// Public API of @clever/contracts/config. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  CONFIG_SCHEMAS,
  netProceedsConfigSchema,
  reconfirmHoursConfigSchema,
  type ConfigKey,
  type ConfigValue,
  type NetProceedsAssumptions,
} from "./config.js";
