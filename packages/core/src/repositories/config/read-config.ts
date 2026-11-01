// Reads one config entry and checks it against its key's schema (T308; constitution VI, IX): the
// value was written outside this code (the seed, later the ops screen), so it is never trusted. A
// missing or malformed entry is a deployment fault, not the caller's, so it is a plain Error (500).
import { CONFIG_SCHEMAS, type ConfigKey, type ConfigValue } from "@clever/contracts/config";
import type { IConfigRepository } from "./IConfigRepository.js";

export async function readConfig<K extends ConfigKey>(
  config: IConfigRepository,
  key: K,
): Promise<ConfigValue<K>> {
  const parsed = CONFIG_SCHEMAS[key].safeParse(await config.findValue(key));
  if (!parsed.success) throw new Error(`Config entry "${key}" is missing or invalid`);
  return parsed.data as ConfigValue<K>;
}
