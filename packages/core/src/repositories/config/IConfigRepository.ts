// The config port (T308; constitution IX): settings the marketplace reads at run time, such as the
// net-proceeds fee assumptions. The value comes back unchecked; `readConfig` checks it.
export interface IConfigRepository {
  /** The stored value of `key`, or null when it was never set. */
  findValue(key: string): Promise<unknown>;
}
