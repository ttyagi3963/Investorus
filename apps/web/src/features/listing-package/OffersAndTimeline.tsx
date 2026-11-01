"use client";
// The bottom of the package page (T301): the offers investors made, each at its latest revision, and
// the timeline of what happened to the package, newest first.
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { OFFER_STATUS_LABELS, formatUsd, timelineText } from "./labels";
import { usePackageOffers, usePackageTimeline } from "./queries";

const SECTION = "flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function OffersAndTimeline({ pkg }: { pkg: AgentPackageView }) {
  const offers = usePackageOffers(pkg.id);
  const timeline = usePackageTimeline(pkg.id);

  return (
    <>
      <section aria-labelledby="offers-heading" className={SECTION}>
        <h2 id="offers-heading" className="font-heading text-heading-sm">
          Offers
        </h2>
        {offers.isError && (
          <ErrorNotice error={describeError(offers.error, "The offers could not be loaded.")} />
        )}
        {offers.data?.length === 0 && <p className="text-muted">No offers yet.</p>}
        <ul className="flex flex-col gap-stack-sm">
          {offers.data?.map((offer) => (
            <li key={offer.id} className="rounded-control border border-default p-inset-md">
              <p className="font-heading">
                {formatUsd(offer.price)} · {offer.paymentType === "CASH" ? "Cash" : "Financed"}
                {` · ${OFFER_STATUS_LABELS[offer.status]}`}
              </p>
              <p className="text-label text-muted">
                Closes {offer.closingDate} · Earnest money {formatUsd(offer.earnestMoney)} ·
                Contingencies: {offer.contingencies.join(", ").toLowerCase() || "none"} · Revision{" "}
                {offer.revision}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="timeline-heading" className={SECTION}>
        <h2 id="timeline-heading" className="font-heading text-heading-sm">
          Timeline
        </h2>
        {timeline.isError && (
          <ErrorNotice error={describeError(timeline.error, "The timeline could not be loaded.")} />
        )}
        <ol className="flex flex-col gap-stack-sm">
          {timeline.data?.map((entry) => (
            <li key={entry.id} className="flex justify-between gap-inline-md">
              <span>{timelineText(entry)}</span>
              <time dateTime={entry.occurredAt} className="text-label text-muted">
                {when(entry.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
