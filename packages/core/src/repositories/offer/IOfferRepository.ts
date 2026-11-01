// The offer port (T291's part): withdrawing a package declines its open offers. Creating and
// revising offers arrive with OfferService (T296).

export interface IOfferRepository {
  /** Declines every ACTIVE offer on the package in the round; returns how many. */
  declineOpen(packageId: string, round: number): Promise<number>;
}
