// The brand port (T348; FR-092): the brands the platform can run as, their stored tokens and content,
// and a theme update that bumps the version so caches replace the old theme.
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
  /** Replaces the tokens and returns the new version. */
  updateTokens(id: string, tokens: unknown): Promise<number>;
}
