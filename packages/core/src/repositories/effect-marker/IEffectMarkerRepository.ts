// The effect marker port (T368; FR-072): a job that may run twice claims its one-time effect's key
// in the same transaction as the effect; only the first claim succeeds, so a re-run does nothing.
export interface IEffectMarkerRepository {
  /** Records the key; false if it was already recorded (the effect already happened). */
  claimOnce(key: string): Promise<boolean>;
}
