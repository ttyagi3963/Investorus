// Today's calendar date for a rule that refuses "past" dates (T387). A browser sends its user's
// local date, and some place on Earth is still on the day before UTC's, so the earliest date in
// use anywhere (UTC-12) is the one that counts: a US user can pick their own today all evening.
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1_000;

/** `YYYY-MM-DD`: the earliest calendar date in use anywhere at `now`. */
export const earliestToday = (now: Date): string =>
  new Date(now.getTime() - TWELVE_HOURS_MS).toISOString().slice(0, 10);
