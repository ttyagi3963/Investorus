"use client";
// A matched package as the investor sees it (T302, T331; FR-040, SC-006): the place, the facts, the
// photos, the price range, and the deadline, never the seller or the street, unless their offer
// won the deal (T317). While offers are open the investor makes, revises, or withdraws their offer
// in the side column; afterwards they answer a counter, keep or withdraw a backup offer, reconfirm
// a promoted backup, or follow their deal. A package that was not shared with them is "not found".
import type {
  InvestorPackageView,
  PackageStatus,
  WinningInvestorPackageView,
} from "@clever/contracts/listing-package";
import { Card, PACKAGE_STATUS_TONES, StatusChip, Thumbnail } from "@clever/ui";
import { useParams } from "next/navigation";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import {
  CONDITION_LABELS,
  OFFER_STATUS_LABELS,
  PROGRAM_LABELS,
  PROPERTY_TYPE_LABELS,
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
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError, isGone } from "@/lib/errors";

const NOTICE = "rounded-control bg-soft p-inset-md text-body";
const DEADLINE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** Why the listing no longer takes offers, by its status. */
const CLOSED_TO_OFFERS: Partial<Record<PackageStatus, string>> = {
  WITHDRAWN: "The agent withdrew this listing, so it no longer takes offers.",
  NO_OFFERS_RECEIVED: "The offer deadline passed, so offers can no longer be made or revised.",
  CLOSED: "This listing has closed.",
  FELL_THROUGH: "The accepted deal fell through. The agent may turn to a backup offer.",
};
const isWinner = (pkg: InvestorPackageView): pkg is WinningInvestorPackageView =>
  "sellerContact" in pkg;

/** The short facts under the title: type, beds, baths, size, and age, where known. */
function factsLine(pkg: InvestorPackageView): string {
  return [
    PROPERTY_TYPE_LABELS[pkg.propertyType],
    pkg.units !== null && `${pkg.units} units`,
    pkg.beds !== null && `${pkg.beds} bd`,
    pkg.baths !== null && `${pkg.baths} ba`,
    pkg.sqft !== null && `${pkg.sqft.toLocaleString()} sqft`,
    pkg.yearBuilt !== null && `Built ${pkg.yearBuilt}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Facts({ pkg }: { pkg: InvestorPackageView }) {
  const facts: [string, string | number | null][] = [
    [
      "Seller expects",
      `${formatUsd(pkg.priceExpectationMin)} to ${formatUsd(pkg.priceExpectationMax)}`,
    ],
    ["Neighborhood", pkg.neighborhood],
    ["Type", PROPERTY_TYPE_LABELS[pkg.propertyType]],
    ["Beds", pkg.beds],
    ["Baths", pkg.baths],
    ["Square feet", pkg.sqft],
    ["Lot square feet", pkg.lotSqft],
    ["Units", pkg.units],
    ["Year built", pkg.yearBuilt],
    ["Condition", pkg.condition && CONDITION_LABELS[pkg.condition]],
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
    <dl className="grid grid-cols-1 gap-stack-md sm:grid-cols-2 lg:grid-cols-3">
      {facts
        .filter(([, value]) => value !== null && value !== "")
        .map(([name, value]) => (
          <div key={name} className="flex flex-col gap-stack-xs">
            <dt className="text-label text-muted">{name}</dt>
            <dd className="text-body-lg text-default">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/** The first photo large, the rest as a row of smaller tiles; a "No image" box when there are none. */
function Photos({ pkg }: { pkg: InvestorPackageView }) {
  const [first, ...rest] = pkg.photos;
  const alt = (index: number) => `${pkg.city} listing, view ${index + 1}`;
  return (
    <Card>
      <Thumbnail src={first?.url ?? null} alt={alt(0)} size="wide" />
      {rest.length > 0 && (
        <ul className="grid grid-cols-3 gap-inline-sm sm:grid-cols-5">
          {rest.map((photo, index) => (
            <li key={photo.id}>
              <Thumbnail src={photo.url} alt={alt(index + 1)} size="fill" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function InvestorPackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isPending, isError, error } = useInvestorPackage(id);
  const now = useNow();
  const open =
    pkg?.status === "ACCEPTING_OFFERS" &&
    (pkg.offerDeadline === null || Date.parse(pkg.offerDeadline) > now);
  const back = { href: "/investor", label: "Opportunities" };

  // A package deleted since this tab loaded it comes back 404: show that, not the remembered copy.
  if (!pkg || isGone(error)) {
    return (
      <>
        <PageHeader title="Listing" back={back} />
        {isPending && <p role="status">Loading the listing…</p>}
        {isError && (
          <ErrorNotice error={describeError(error, "The listing could not be loaded.")} />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`${pkg.city}, ${pkg.state} ${pkg.zip}`}
        back={back}
        status={
          pkg.status === "ACCEPTING_OFFERS" && pkg.offerDeadline ? (
            <StatusChip tone="offers-in">
              Offers close {new Date(pkg.offerDeadline).toLocaleString(undefined, DEADLINE)} (
              {timeLeft(pkg.offerDeadline, now)})
            </StatusChip>
          ) : (
            <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>
              {STATUS_LABELS[pkg.status]}
            </StatusChip>
          )
        }
        description={factsLine(pkg)}
      />
      <div className="grid grid-cols-1 items-start gap-stack-lg lg:grid-cols-3">
        <div className="flex flex-col gap-stack-lg lg:col-span-2">
          <Photos pkg={pkg} />
          <Card title="Home details">
            <Facts pkg={pkg} />
          </Card>
        </div>
        <div className="flex flex-col gap-stack-lg">
          <MyOffer pkg={pkg} open={open} />
          <p className="text-helper text-muted">
            The seller&apos;s name and contact details are never shared unless your offer is
            accepted.
          </p>
        </div>
      </div>
    </>
  );
}

/** The investor's own offer and what they can do with it now, in the side column. */
function MyOffer({ pkg, open }: { pkg: InvestorPackageView; open: boolean }) {
  const offer = pkg.myOffer;
  const promoted = pkg.myDeal?.status === "PENDING_RECONFIRMATION" && pkg.myDeal.reconfirmBy;
  if (isWinner(pkg)) {
    return (
      <>
        <Card title="Your offer">
          <p role="status" className={NOTICE}>
            Your offer was accepted. Deal status: {STATUS_LABELS[pkg.status]}.
          </p>
        </Card>
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
      <Card
        title="Your offer"
        description={`Seller expects ${formatUsd(pkg.priceExpectationMin)} to ${formatUsd(pkg.priceExpectationMax)}.`}
      >
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
      </Card>
    </>
  );
}
