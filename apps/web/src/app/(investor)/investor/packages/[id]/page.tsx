"use client";
// A matched package as the investor sees it (T302; FR-040, SC-006): the place, the facts, the
// photos, the price range, and the deadline, never the seller or the street, unless their offer
// won the deal (T317). While offers are open the investor makes, revises, or withdraws their offer;
// afterwards they answer a counter, keep or withdraw a backup offer, reconfirm a promoted backup,
// or follow their deal. A package that was not shared with them is "not found".
import type {
  InvestorPackageView,
  PackageStatus,
  WinningInvestorPackageView,
} from "@clever/contracts/listing-package";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import {
  OFFER_STATUS_LABELS,
  PROGRAM_LABELS,
  STATUS_LABELS,
  formatUsd,
} from "@/features/listing-package/labels";
import { OfferForm } from "@/features/offers/OfferForm";
import {
  BackupPanel,
  CounterPanel,
  ReconfirmPanel,
  SellerCard,
  WithdrawOfferButton,
} from "@/features/offers/OfferPanels";
import { useInvestorPackage } from "@/features/offers/queries";
import { timeLeft, useNow } from "@/features/offers/time-left";
import { describeError } from "@/lib/errors";

const SECTION = "flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card";
const NOTICE = "rounded-control border border-default bg-card p-inset-md";

/** Why the listing no longer takes offers, by its status. */
const CLOSED_TO_OFFERS: Partial<Record<PackageStatus, string>> = {
  WITHDRAWN: "The agent withdrew this listing, so it no longer takes offers.",
  NO_OFFERS_RECEIVED: "The offer deadline passed, so offers can no longer be made or revised.",
  CLOSED: "This listing has closed.",
  FELL_THROUGH: "The accepted deal fell through. The agent may turn to a backup offer.",
};
const isWinner = (pkg: InvestorPackageView): pkg is WinningInvestorPackageView =>
  "sellerContact" in pkg;
const label = (code: string) => code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_", " ");

function Facts({ pkg }: { pkg: InvestorPackageView }) {
  const facts: [string, string | number | null][] = [
    ["Type", label(pkg.propertyType)],
    ["Beds", pkg.beds],
    ["Baths", pkg.baths],
    ["Square feet", pkg.sqft],
    ["Lot square feet", pkg.lotSqft],
    ["Units", pkg.units],
    ["Year built", pkg.yearBuilt],
    ["Condition", pkg.condition && label(pkg.condition)],
    ["Repair estimate", pkg.repairEstimate === null ? null : formatUsd(pkg.repairEstimate)],
    [
      "Closing window",
      pkg.closingWindowStart && `${pkg.closingWindowStart} to ${pkg.closingWindowEnd}`,
    ],
    [
      "Listed for sale now",
      pkg.currentlyListed === null ? null : pkg.currentlyListed ? "Yes" : "No",
    ],
    ["Programs", pkg.eligiblePrograms.map((p) => PROGRAM_LABELS[p]).join(", ")],
  ];
  return (
    <dl className="grid grid-cols-2 gap-stack-sm">
      {facts
        .filter(([, value]) => value !== null && value !== "")
        .map(([name, value]) => (
          <div key={name}>
            <dt className="text-label text-muted">{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export default function InvestorPackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isPending, isError, error } = useInvestorPackage(id);
  const now = useNow();
  const open =
    pkg?.status === "ACCEPTING_OFFERS" &&
    (pkg.offerDeadline === null || Date.parse(pkg.offerDeadline) > now);

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href="/investor" className="text-label text-link underline">
        Back to your matches
      </Link>
      {isPending && <p role="status">Loading the listing…</p>}
      {isError && <ErrorNotice error={describeError(error, "The listing could not be loaded.")} />}
      {pkg && (
        <>
          <h1 className="font-heading text-heading-lg">
            {pkg.city}, {pkg.state} {pkg.zip}
          </h1>
          <section aria-label="Listing" className={SECTION}>
            <p className="font-heading text-heading-sm">
              {formatUsd(pkg.priceExpectationMin)} to {formatUsd(pkg.priceExpectationMax)}
            </p>
            {pkg.neighborhood && <p className="text-muted">{pkg.neighborhood}</p>}
            <p>
              {pkg.status === "ACCEPTING_OFFERS"
                ? `Offers due by ${pkg.offerDeadline ? new Date(pkg.offerDeadline).toLocaleString() : "—"} (${timeLeft(pkg.offerDeadline, now)})`
                : STATUS_LABELS[pkg.status]}
            </p>
            <Facts pkg={pkg} />
            {pkg.photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-stack-md md:grid-cols-4">
                {pkg.photos.map((photo, index) => (
                  <li key={photo.id}>
                    <img
                      src={photo.url}
                      alt={`${pkg.city} listing, view ${index + 1}`}
                      className="aspect-square w-full rounded-control border border-default object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <MyOffer pkg={pkg} open={open} />
        </>
      )}
    </div>
  );
}

/** The investor's own offer and what they can do with it now. */
function MyOffer({ pkg, open }: { pkg: InvestorPackageView; open: boolean }) {
  const offer = pkg.myOffer;
  const promoted = pkg.myDeal?.status === "PENDING_RECONFIRMATION" && pkg.myDeal.reconfirmBy;
  if (isWinner(pkg)) {
    return (
      <>
        <p role="status" className={NOTICE}>
          Your offer was accepted. Deal status: {STATUS_LABELS[pkg.status]}.
        </p>
        <SellerCard pkg={pkg} />
      </>
    );
  }
  if (offer?.status === "BACKUP" && promoted) {
    return <ReconfirmPanel offer={offer} reconfirmBy={promoted} />;
  }
  if (offer?.status === "BACKUP") return <BackupPanel offer={offer} />;
  return (
    <>
      {offer?.status === "COUNTERED" && <CounterPanel offer={offer} />}
      {open ? (
        <OfferForm
          key={offer?.version ?? 0}
          packageId={pkg.id}
          myOffer={offer}
          deadline={pkg.offerDeadline}
        />
      ) : (
        <p role="status" className={NOTICE}>
          {CLOSED_TO_OFFERS[pkg.status] ??
            (pkg.status === "ACCEPTING_OFFERS"
              ? "The offer deadline has passed, so offers can no longer be made or revised."
              : "The seller accepted another offer.")}
          {offer &&
            ` Your offer: ${formatUsd(offer.price)} (${OFFER_STATUS_LABELS[offer.status]}).`}
        </p>
      )}
      {offer && (offer.status === "ACTIVE" || offer.status === "COUNTERED") && (
        <WithdrawOfferButton offer={offer} />
      )}
    </>
  );
}
