// The investor port (T308, T322): what the agent's offer comparison shows of each investor, their
// company name; and the legacy import's writes, which find an investor by the spreadsheet's
// Investor ID or else by email, and create or update them.
import type { Investor } from "@clever/contracts/investor";

/** An investor's own fields, as the import writes them. */
export type InvestorFields = Omit<Investor, "id" | "createdAt" | "updatedAt">;

export interface IInvestorRepository {
  /** Each investor's company name, by ID. */
  findCompanyNames(ids: string[]): Promise<Map<string, string>>;
  /** The investor with this external reference, else with this email, or null. */
  findIdForImport(externalRef: string | null, email: string): Promise<string | null>;
  /**
   * Creates the investor (`id` null) or updates it; returns its ID. An email another investor
   * already has is a BusinessRuleError.
   */
  save(id: string | null, investor: InvestorFields): Promise<string>;
}
