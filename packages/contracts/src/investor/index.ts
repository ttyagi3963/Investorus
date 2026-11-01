// Public API of @clever/contracts/investor. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export {
  INVESTOR_STATUSES,
  INVESTOR_TYPES,
  type Investor,
  type InvestorStatus,
  type InvestorType,
} from "./investor.js";
