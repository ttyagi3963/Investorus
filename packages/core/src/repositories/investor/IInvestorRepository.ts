// The investor port (T308): what the agent's offer comparison shows of each investor, their company
// name. Investors are seeded until buy box editing (US5).
export interface IInvestorRepository {
  /** Each investor's company name, by ID. */
  findCompanyNames(ids: string[]): Promise<Map<string, string>>;
}
