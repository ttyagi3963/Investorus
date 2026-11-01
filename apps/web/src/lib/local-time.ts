// The value a datetime-local input shows for an ISO time (T302, T315): `YYYY-MM-DDTHH:mm` in the
// browser's local time. One place, so every deadline and expiry field reads the same way.
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
