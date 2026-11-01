// Local-time helpers (T302, T315, T342): the value a datetime-local input shows for an ISO time, and
// a short "Nov 6, 5:00 PM" for lists and timelines, both in the browser's local time. One place, so
// every deadline, expiry, and event time reads the same way.
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const formatLocalTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
