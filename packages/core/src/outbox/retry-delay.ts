// How long a failed delivery waits before its next try (T339; FR-071, contracts/events.md): the wait
// grows by `factor` from `baseMs` with each failure, is capped at `capMs`, and is spread by up to
// ±jitter so deliveries that failed together do not all retry at the same instant.
import type { DeliveryRetryPolicy } from "@clever/contracts/config";

export function retryDelayMs(
  policy: DeliveryRetryPolicy,
  /** How many tries have failed so far (1 after the first failure). */
  failures: number,
  random: () => number = Math.random,
): number {
  const grown = Math.min(policy.capMs, policy.baseMs * policy.factor ** (failures - 1));
  const spread = 1 + policy.jitter * (2 * random() - 1);
  return Math.round(grown * spread);
}
