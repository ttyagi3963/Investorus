// Local-time helpers (T302, T315, T342, T385): the value a datetime-local input shows for an ISO time,
// the check that what it gives back is a time, and a short "Nov 6, 5:00 PM" for lists and timelines,
// all in the browser's local time. One place, so every deadline, expiry, and event time reads the same.
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * A datetime-local field's `validate` (T385): a browser without the picker gives a plain text box, and
 * a year past what a Date holds is not a time either, so the field says so instead of the submit
 * failing with a RangeError.
 */
export const checkLocalInput = (value: string) =>
  Number.isNaN(new Date(value).getTime()) ? "Enter a date and time." : null;

export const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
