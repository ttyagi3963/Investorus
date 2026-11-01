// The settings the marketplace reads at run time (T304, T336; constitution IX), one Zod schema per
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

/**
 * How a failed outside delivery is retried (FR-071, contracts/events.md): waits grow from baseMs by
 * factor, capped at capMs, each spread by up to ±jitter, for at most `attempts` tries in all.
 */
export const deliveryRetryConfigSchema = z.object({
  baseMs: z.number().int().positive(),
  factor: z.number().min(1),
  capMs: z.number().int().positive(),
  jitter: z.number().min(0).max(1),
  attempts: z.number().int().min(1).max(25),
});
export type DeliveryRetryPolicy = z.infer<typeof deliveryRetryConfigSchema>;

/** When the daily match digest goes out (FR-023): the hour of the day, in UTC. */
export const matchDigestConfigSchema = z.object({ hourUtc: z.number().int().min(0).max(23) });

export const CONFIG_SCHEMAS = {
  netProceeds: netProceedsConfigSchema,
  reconfirmHours: reconfirmHoursConfigSchema,
  deliveryRetry: deliveryRetryConfigSchema,
  matchDigest: matchDigestConfigSchema,
} as const;
export type ConfigKey = keyof typeof CONFIG_SCHEMAS;
export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG_SCHEMAS)[K]>;
