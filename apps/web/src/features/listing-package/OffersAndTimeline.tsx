"use client";
// The package page's side cards (T301, T330): the offers investors made, each at its latest
// revision, with how many came in and the highest price, and the activity on the package, newest
// first. While offers are open, the offers card links to the comparison.
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { buttonClasses, Card, OFFER_STATUS_TONES, StatTile, StatusChip } from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { OFFER_STATUS_LABELS, formatUsd, timelineText } from "./labels";
import { usePackageOffers, usePackageTimeline } from "./queries";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function PackageOffers({ pkg }: { pkg: AgentPackageView }) {
  const offers = usePackageOffers(pkg.id);
  const list = offers.data ?? [];
  const highest = list.length > 0 ? formatUsd(Math.max(...list.map((o) => o.price))) : "–";

  return (
    <Card title="Offers">
      {offers.isError && (
        <ErrorNotice error={describeError(offers.error, "The offers could not be loaded.")} />
      )}
      {offers.data && (
        <div className="grid grid-cols-2 gap-inline-md">
          <StatTile label="Received" value={list.length} />
          <StatTile label="Highest price" value={highest} />
        </div>
      )}
      {offers.data?.length === 0 && <p className="text-body text-muted">No offers yet.</p>}
      {list.length > 0 && (
        <ul className="flex flex-col gap-stack-sm">
          {list.map((offer) => (
            <li
              key={offer.id}
              className="flex flex-col gap-stack-xs rounded-control border border-default p-inset-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-inline-sm">
                <p className="font-heading text-body-lg font-semibold text-heading">
                  {formatUsd(offer.price)} · {offer.paymentType === "CASH" ? "Cash" : "Financed"}
                </p>
                <StatusChip tone={OFFER_STATUS_TONES[offer.status]}>
                  {OFFER_STATUS_LABELS[offer.status]}
                </StatusChip>
              </div>
              <p className="text-helper text-muted">
                Closes {offer.closingDate} · Earnest money {formatUsd(offer.earnestMoney)} ·
                Contingencies: {offer.contingencies.join(", ").toLowerCase() || "none"} · Revision{" "}
                {offer.revision}
              </p>
            </li>
          ))}
        </ul>
      )}
      {pkg.status === "ACCEPTING_OFFERS" && (
        <Link
          href={`/agent/packages/${pkg.id}/compare`}
          className={buttonClasses({ fullWidth: true })}
        >
          Compare offers
        </Link>
      )}
    </Card>
  );
}

export function PackageActivity({ pkg }: { pkg: AgentPackageView }) {
  const timeline = usePackageTimeline(pkg.id);

  return (
    <Card title="Activity">
      {timeline.isError && (
        <ErrorNotice error={describeError(timeline.error, "The timeline could not be loaded.")} />
      )}
      <ol className="flex flex-col gap-stack-md">
        {timeline.data?.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-stack-xs">
            <span className="text-body text-default">{timelineText(entry)}</span>
            <time dateTime={entry.occurredAt} className="text-helper text-muted">
              {when(entry.occurredAt)}
            </time>
          </li>
        ))}
      </ol>
    </Card>
  );
}
