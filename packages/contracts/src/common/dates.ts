// The date checks for fields people fill in (T422): the same ISO formats Zod checks, but a bad value
// is called an invalid date in plain words rather than Zod's "Invalid ISO date".
import { z } from "zod";

/** A calendar date, such as 2026-12-15. */
export const isoDate = () => z.iso.date({ message: "Invalid date" });

/** A date and time with its zone, such as 2026-12-01T17:00:00.000Z. */
export const isoDateTime = () => z.iso.datetime({ message: "Invalid date and time" });
