// The brand port (T348, T353; FR-092): the brands the platform can run as, their stored tokens and
// content, and a theme update that bumps the version so caches replace the old theme. The update
// applies only over the version the editor loaded, so one operator cannot overwrite another's save.
export type BrandRecord = {
  id: string;
  name: string;
  hosts: string[];
  tokens: unknown;
  content: unknown;
  tokenVersion: number;
};

export interface IBrandRepository {
  list(): Promise<Pick<BrandRecord, "id" | "name" | "hosts">[]>;
  findById(id: string): Promise<BrandRecord | null>;
  /** Replaces the tokens if the brand is still at `expectedVersion`; the new version, or null. */
  updateTokens(id: string, tokens: unknown, expectedVersion: number): Promise<number | null>;
}
