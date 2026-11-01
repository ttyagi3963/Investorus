"use client";
// The offer comparison (T315, restyled in T330; FR-050 to FR-052): every offer still in play side by
// side as columns, sortable by net proceeds, closing date, or certainty, the leading offer for the
// sort highlighted, each net figure with a breakdown of what was subtracted, and the seller's
// decision recorded from here. An expired, backup, or countered offer cannot be accepted directly.
import type { CreateDecisionInput } from "@clever/contracts/deal";
import type { ComparisonSort, OfferComparisonRow } from "@clever/contracts/offer";
import {
  Card,
  OFFER_STATUS_TONES,
  PopoverPanel,
  Select,
  StatusChip,
  type StatusTone,
} from "@clever/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AcceptButton,
  CounterDialog,
  DeclineAllDialog,
} from "@/features/decisions/DecisionDialogs";
import { useComparison } from "@/features/decisions/queries";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { OFFER_STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { packageKeys, usePackage } from "@/features/listing-package/queries";
import { PageHeader } from "@/features/shell/PageHeader";
import { listingPackages } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

const SORTS = [
  { id: "netProceeds", label: "Net proceeds (highest first)" },
  { id: "closingDate", label: "Closing date (soonest first)" },
  { id: "certainty", label: "Certainty (fewest contingencies first)" },
];
/** What the first offer in each sort leads on, named on its column's badge. */
const LEADS: Record<ComparisonSort, string> = {
  netProceeds: "Best net",
  closingDate: "Soonest close",
  certainty: "Most certain",
};
/**
 * The leader's badge takes the brand's strong navy tone, as in the design: it is a ranking, not a
 * status, and the in-progress tone would vanish on the leading column's accent tint.
 */
const LEAD_TONE: StatusTone = "closed";
const ROW_HEAD =
  "border-b border-subtle px-inset-lg py-inset-md text-left align-top text-label font-medium text-muted";
const CELL = "border-b border-subtle px-inset-md py-inset-md text-left align-top text-body";
const lower = (code: string) => code.toLowerCase().replaceAll("_", " ");
/** A `YYYY-MM-DD` date, read as that calendar day wherever the browser is. */
const day = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
const moment = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Breakdown({ row }: { row: OfferComparisonRow }) {
  return (
    <PopoverPanel
      triggerLabel={formatUsd(row.netProceeds)}
      panelLabel="How net proceeds are estimated"
    >
      <dl className="flex flex-col gap-stack-sm">
        {row.breakdown.map((line) => (
          <div key={line.label} className="flex justify-between gap-inline-md">
            <dt>{line.label}</dt>
            <dd>{formatUsd(line.amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-inline-md font-heading">
          <dt>Estimated net to the seller</dt>
          <dd>{formatUsd(row.netProceeds)}</dd>
        </div>
      </dl>
    </PopoverPanel>
  );
}

/** One attribute across every offer, its name as the row header; the leading column is tinted. */
function AttributeRow({
  label,
  rows,
  cell,
  last,
}: {
  label: string;
  rows: OfferComparisonRow[];
  cell: (row: OfferComparisonRow) => ReactNode;
  last?: boolean;
}) {
  const edge = last ? "border-b-0" : "";
  return (
    <tr>
      <th scope="row" className={`${ROW_HEAD} ${edge}`}>
        {label}
      </th>
      {rows.map((row, index) => (
        <td key={row.offer.id} className={`${CELL} ${edge} ${index === 0 ? "bg-accent-subtle" : ""}`}>
          {cell(row)}
        </td>
      ))}
    </tr>
  );
}

export default function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const [sort, setSort] = useState<ComparisonSort>("netProceeds");
  const pkg = usePackage(id);
  const comparison = useComparison(id, sort);
  const { run, isBusy, error } = useAction(
    "The decision could not be recorded. Try again.",
    packageKeys.all,
  );
  const decide = (input: CreateDecisionInput) => run(() => listingPackages.decide(id, input));
  const open = pkg.data?.status === "ACCEPTING_OFFERS";
  const rows = comparison.data?.rows ?? [];
  const p = pkg.data;

  const description =
    p && comparison.data ? (
      <>
        {rows.length} offer{rows.length === 1 ? "" : "s"}
        {p.offerDeadline &&
          (open
            ? `; the offer window closes on ${moment(p.offerDeadline)}`
            : ` received before the window closed on ${moment(p.offerDeadline)}`)}
        . The seller expects {formatUsd(p.priceExpectationMin)} to{" "}
        {formatUsd(p.priceExpectationMax)}
        {p.closingWindowStart && p.closingWindowEnd
          ? ` and wants to close between ${day(p.closingWindowStart)} and ${day(p.closingWindowEnd)}`
          : ""}
        .
      </>
    ) : undefined;

  return (
    <>
      <PageHeader
        back={{
          href: `/agent/packages/${id}`,
          label: p
            ? `${p.property.streetLine}, ${p.property.city}, ${p.property.state} ${p.property.zip}`
            : "Back to the package",
        }}
        title="Compare offers"
        description={description}
      />
      {comparison.isError && (
        <ErrorNotice error={describeError(comparison.error, "The offers could not be loaded.")} />
      )}
      {error && <ErrorNotice error={error} />}
      {!open && p && (
        <p role="status" className="rounded-card bg-status-closed p-inset-md text-status-closed">
          This package is no longer taking decisions on offers.{" "}
          <Link href={`/agent/packages/${id}/deal`} className="font-semibold text-link underline">
            See the deal
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-inline-md">
        <Select
          label="Sort by"
          options={SORTS}
          selectedKey={sort}
          onSelectionChange={(key) => setSort(key as ComparisonSort)}
        />
        {open && p && rows.length > 0 && (
          <DeclineAllDialog version={p.version} onDecide={decide} isDisabled={isBusy} />
        )}
      </div>
      {comparison.data && rows.length === 0 && (
        <Card>
          <p className="text-muted">No offers to compare.</p>
        </Card>
      )}
      {rows.length > 0 && (
        <Card>
          {/* Wider than a phone, the region scrolls sideways. Every column holds buttons, so tabbing
              through them scrolls it for a keyboard user too. */}
          <div role="region" aria-label="Offers side by side" className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse">
              <caption className="sr-only">
                Offers, sorted by {SORTS.find((option) => option.id === sort)?.label.toLowerCase()}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`${ROW_HEAD} border-default`}>
                    Offer
                  </th>
                  {rows.map((row, index) => (
                    <th
                      key={row.offer.id}
                      scope="col"
                      className={`border-b border-t-4 border-b-default px-inset-md py-inset-md text-left align-top ${
                        index === 0 ? "border-t-selected bg-accent-subtle" : "border-t-transparent"
                      }`}
                    >
                      <span className="flex flex-col items-start gap-stack-xs">
                        {index === 0 && (
                          <StatusChip tone={LEAD_TONE}>{LEADS[sort]}</StatusChip>
                        )}
                        <span className="font-heading text-body-lg font-semibold text-heading">
                          {row.investorName}
                        </span>
                        <span className="text-helper font-regular text-muted">
                          Revision {row.offer.revision} · {moment(row.offer.updatedAt)}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <AttributeRow
                  label="Offer price"
                  rows={rows}
                  cell={(row) => (
                    <span className="font-heading text-heading-xs text-heading">
                      {formatUsd(row.offer.price)}
                    </span>
                  )}
                />
                <AttributeRow
                  label="Net proceeds"
                  rows={rows}
                  cell={(row) => <Breakdown row={row} />}
                />
                <AttributeRow
                  label="Earnest money"
                  rows={rows}
                  cell={(row) => formatUsd(row.offer.earnestMoney)}
                />
                <AttributeRow
                  label="Close date"
                  rows={rows}
                  cell={(row) => day(row.offer.closingDate)}
                />
                <AttributeRow
                  label="Payment"
                  rows={rows}
                  cell={(row) => (row.offer.paymentType === "CASH" ? "Cash" : "Financed")}
                />
                <AttributeRow
                  label="Contingencies"
                  rows={rows}
                  cell={(row) => row.offer.contingencies.map(lower).join(", ") || "None"}
                />
                <AttributeRow
                  label="Offer expires"
                  rows={rows}
                  cell={(row) =>
                    row.expired ? (
                      <strong className="text-danger">Expired</strong>
                    ) : (
                      moment(row.offer.expiresAt)
                    )
                  }
                />
                <AttributeRow
                  label="Status"
                  rows={rows}
                  cell={(row) => (
                    <StatusChip tone={OFFER_STATUS_TONES[row.offer.status]}>
                      {OFFER_STATUS_LABELS[row.offer.status]}
                    </StatusChip>
                  )}
                />
                <AttributeRow
                  label="Seller's decision"
                  rows={rows}
                  last
                  cell={(row) =>
                    row.acceptable ? (
                      <div className="flex flex-col gap-stack-sm">
                        <AcceptButton
                          offer={row.offer}
                          investorName={row.investorName}
                          onDecide={decide}
                          isDisabled={isBusy}
                        />
                        <CounterDialog
                          offer={row.offer}
                          investorName={row.investorName}
                          onDecide={decide}
                          isDisabled={isBusy}
                        />
                      </div>
                    ) : (
                      <span className="text-label text-muted">
                        {row.expired ? "Cannot be accepted" : "No decision available"}
                      </span>
                    )
                  }
                />
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {comparison.data && (
        <p className="text-helper text-muted">
          Net proceeds subtract the investor&apos;s fees and concessions, closing costs of{" "}
          {+(comparison.data.assumptions.closingCostPct * 100).toFixed(2)}% of the price, and{" "}
          {formatUsd(comparison.data.assumptions.flatFees)} in flat fees. Press a figure to see its
          breakdown. The seller decides; you record the decision here.
        </p>
      )}
    </>
  );
}
