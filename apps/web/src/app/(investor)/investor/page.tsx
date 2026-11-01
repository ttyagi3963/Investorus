"use client";
// The investor's dashboard (T302; FR-040): the packages they were matched to, newest first, each
// with its time left, an "Offer made" badge, and withdrawn packages marked; loading, error, and
// empty states.
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { OFFER_STATUS_LABELS, STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { useMatchedPackages } from "@/features/offers/queries";
import { timeLeft, useNow } from "@/features/offers/time-left";
import { describeError } from "@/lib/errors";

export default function InvestorDashboard() {
  const { data: packages, isPending, isError, error } = useMatchedPackages();
  const now = useNow();

  return (
    <div className="flex flex-col gap-stack-lg">
      <h1 className="font-heading text-heading-lg">Listings that match your buy boxes</h1>
      {isPending && <p role="status">Loading your matches…</p>}
      {isError && <ErrorNotice error={describeError(error, "Your matches could not be loaded.")} />}
      {packages?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-muted shadow-card">
          No matches yet. A new listing that fits one of your buy boxes appears here, and in your
          notifications.
        </p>
      )}
      <ul className="flex flex-col gap-stack-md">
        {packages?.map((pkg) => (
          <li key={pkg.id}>
            <Link
              href={`/investor/packages/${pkg.id}`}
              className="flex gap-inline-md rounded-card border border-default bg-card p-inset-md shadow-card outline-none hover:border-strong focus-visible:outline-2 focus-visible:outline-focus"
            >
              {pkg.photoUrl && (
                <img
                  src={pkg.photoUrl}
                  alt=""
                  className="size-24 rounded-control border border-default object-cover"
                />
              )}
              <span className="flex flex-col gap-stack-sm">
                <span className="font-heading text-heading-sm">
                  {pkg.city}, {pkg.state} {pkg.zip}
                </span>
                <span className="text-label text-muted">
                  {formatUsd(pkg.priceExpectationMin)} to {formatUsd(pkg.priceExpectationMax)} ·{" "}
                  {pkg.status === "ACCEPTING_OFFERS"
                    ? timeLeft(pkg.offerDeadline, now)
                    : STATUS_LABELS[pkg.status]}
                </span>
                {pkg.myOfferStatus && (
                  <span className="text-label font-heading">
                    {pkg.myOfferStatus === "ACTIVE"
                      ? "Offer made"
                      : `Your offer: ${OFFER_STATUS_LABELS[pkg.myOfferStatus].toLowerCase()}`}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
