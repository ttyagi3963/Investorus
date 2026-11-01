// The Investor the app passes around, shaped from the Prisma `Investor` model (T278): a buying
// company Clever sends matched packages to. A plain type: investors come from our own database
// (the seed today, the spreadsheet import later), which enforces the rules.

export const INVESTOR_TYPES = ["DIRECT_BUYER", "WHOLESALER", "IBUYER"] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

export const INVESTOR_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

export type Investor = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  investorType: InvestorType;
  status: InvestorStatus;
  /** Matching considers the investor only while this is in the future; null means unverified. */
  proofOfFundsExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
