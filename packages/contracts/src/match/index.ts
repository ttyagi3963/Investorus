// Public API of @clever/contracts/match. Other packages import from here, never from the
// individual files, so the files can change without breaking callers.
export { MATCH_TRIGGERS, type Match, type MatchTrigger } from "./match.js";
