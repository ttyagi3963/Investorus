// The operations read model (T341; FR-071, FR-073, FR-074, FR-078): the joins and counts the
// operations console needs, in one place instead of spread over the domain repositories. Reads only;
// every change still goes through the domain repositories and services.
import type { BuyBox } from "@clever/contracts/buy-box";
import type { DeliveryStatus, DeliveryTarget } from "@clever/contracts/events";
import type { DeliveryCounts } from "@clever/contracts/ops";
import type { PackageStatus } from "@clever/contracts/listing-package";

export type OpsPackage = {
  id: string;
  status: PackageStatus;
  streetLine: string;
  city: string;
  state: string;
  zip: string;
  round: number;
  listingVersion: number;
  offerDeadline: Date | null;
  updatedAt: Date;
};

export type OpsPackageSummary = OpsPackage & {
  matchedCount: number;
  offerCount: number;
  deliveries: DeliveryCounts;
};

/** A delivery with what its event says about it. */
export type OpsDelivery = {
  id: string;
  target: DeliveryTarget;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
  eventType: string;
  /** The package the event is about; null for an investor's daily digest. */
  packageId: string | null;
  /** The investor an email or text goes to; null for the CRM. */
  investorId: string | null;
  /** For an investor notice, which notice it carries. */
  noticeType: string | null;
};

export interface IOpsQueryRepository {
  listPackages(): Promise<OpsPackageSummary[]>;
  findPackage(id: string): Promise<OpsPackage | null>;
  deliveriesForPackage(packageId: string): Promise<OpsDelivery[]>;
  /** The newest deliveries first, at most `limit`. */
  listDeliveries(status: DeliveryStatus | undefined, limit: number): Promise<OpsDelivery[]>;
  activeInvestors(): Promise<{ id: string; companyName: string }[]>;
  buyBoxNames(ids: string[]): Promise<Map<string, string>>;
  /** The box as it was at `at`: its newest saved version from then or earlier. */
  buyBoxVersionAt(buyBoxId: string, at: Date): Promise<{ version: number; box: BuyBox } | null>;
  listingVersionCreatedAt(packageId: string, listingVersion: number): Promise<Date | null>;
}
