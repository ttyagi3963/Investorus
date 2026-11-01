// The ZIP lookup port (T067): the city, state, and default neighborhood for a ZIP, so agents never
// type them (a typo would make STATE buy boxes miss the listing). `null` means an unknown ZIP.

export type ZipInfo = { city: string; state: string; neighborhood: string };

export interface IGeoProvider {
  lookup(zip: string): ZipInfo | null;
}
