// The settings the marketplace reads at run time (T304; constitution IX), one Zod schema per
// ConfigEntry key. A stored value is checked on read: it was written outside this code.
import { z } from "zod";

/** How net proceeds are estimated (FR-050, FR-051): a share of the price and a flat amount. */
export const netProceedsConfigSchema = z.object({
  closingCostPct: z.number().min(0).max(0.2),
  flatFees: z.number().int().min(0),
});
export type NetProceedsAssumptions = z.infer<typeof netProceedsConfigSchema>;

/** How long a promoted backup has to reconfirm (FR-057). */
export const reconfirmHoursConfigSchema = z.number().int().positive();

export const CONFIG_SCHEMAS = {
  netProceeds: netProceedsConfigSchema,
  reconfirmHours: reconfirmHoursConfigSchema,
} as const;
export type ConfigKey = keyof typeof CONFIG_SCHEMAS;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG_SCHEMAS)[K]>;
