"use client";
// The investor's opportunities (T302, T331; FR-040): the packages they were matched to, newest
// first, as cards with the first photo, the place, the time left (or the status once offers close),
// the price range, and their own offer's status; loading, error, and empty states.
import type { InvestorPackageSummary } from "@clever/contracts/listing-package";
import { OFFER_STATUS_TONES, PACKAGE_STATUS_TONES, StatusChip, Thumbnail } from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import {
  OFFER_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
  formatUsd,
} from "@/features/listing-package/labels";
import { useMatchedPackages } from "@/features/offers/queries";
import { timeLeft, useNow } from "@/features/offers/time-left";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

export default function InvestorDashboard() {
  const { data: packages, isPending, isError, error } = useMatchedPackages();
  const now = useNow();

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Homes that matched one of your buy boxes. Offers go to the listing agent."
      />
      {isPending && <p role="status">Loading your matches…</p>}
      {isError && <ErrorNotice error={describeError(error, "Your matches could not be loaded.")} />}
      {packages?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-body-lg text-muted shadow-card">
          No matches yet. A new listing that fits one of your buy boxes appears here, and in your
          notifications.
        </p>
      )}
      {packages && packages.length > 0 && (
        <>
          <ul className="grid grid-cols-1 gap-stack-lg md:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <li key={pkg.id}>
                <OpportunityCard pkg={pkg} now={now} />
              </li>
            ))}
          </ul>
          <p className="text-helper text-muted">
            Street addresses and seller details are not shown.
          </p>
        </>
      )}
    </>
  );
}

/** One matched package. The title's link covers the whole card, so the card is one link. */
function OpportunityCard({ pkg, now }: { pkg: InvestorPackageSummary; now: number }) {
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-card bg-card shadow-card">
      <Thumbnail src={pkg.photoUrl} alt="" size="wide" />
      <div className="flex flex-1 flex-col gap-stack-sm px-inset-lg pt-inset-md pb-inset-lg">
        <div className="flex items-baseline justify-between gap-inline-md">
          <h2 className="font-heading text-heading-xs font-medium text-heading">
            <Link
              href={`/investor/packages/${pkg.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-card hover:text-link focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
            >
              {pkg.city}, {pkg.state} {pkg.zip}
            </Link>
          </h2>
          {pkg.status === "ACCEPTING_OFFERS" ? (
            <span className="whitespace-nowrap text-helper font-semibold text-status-offers-in">
              {timeLeft(pkg.offerDeadline, now)}
            </span>
          ) : (
            <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>
              {STATUS_LABELS[pkg.status]}
            </StatusChip>
          )}
        </div>
        <p className="text-body text-muted">{PROPERTY_TYPE_LABELS[pkg.propertyType]}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-inline-md border-t border-subtle pt-inset-md">
          <p className="text-body text-muted">
            Seller expects{" "}
            <span className="font-semibold text-default">
              {formatUsd(pkg.priceExpectationMin)} to {formatUsd(pkg.priceExpectationMax)}
            </span>
          </p>
          {pkg.myOfferStatus && (
            <StatusChip tone={OFFER_STATUS_TONES[pkg.myOfferStatus]}>
              {pkg.myOfferStatus === "ACTIVE"
                ? "Offer made"
                : `Your offer: ${OFFER_STATUS_LABELS[pkg.myOfferStatus].toLowerCase()}`}
            </StatusChip>
          )}
        </div>
      </div>
    </article>
  );
}
