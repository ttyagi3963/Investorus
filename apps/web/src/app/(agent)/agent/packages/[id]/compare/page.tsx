"use client";
// The offer comparison (T315; FR-050 to FR-052): every offer still in play side by side, sortable
// by net proceeds, closing date, or certainty, each net figure with a breakdown of what was
// subtracted, and the seller's decision recorded from here. An expired offer is marked and cannot
// be accepted; a backup or countered offer cannot be accepted directly either.
import type { CreateDecisionInput } from "@clever/contracts/deal";
import type { ComparisonSort, OfferComparisonRow } from "@clever/contracts/offer";
import { PopoverPanel, Select } from "@clever/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { listingPackages } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

const SORTS = [
  { id: "netProceeds", label: "Net proceeds (highest first)" },
  { id: "closingDate", label: "Closing date (soonest first)" },
  { id: "certainty", label: "Certainty (fewest contingencies first)" },
];
const CELL = "border-b border-default p-inset-sm text-left align-top";
const lower = (code: string) => code.toLowerCase().replaceAll("_", " ");

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

  return (
    <div className="flex flex-col gap-stack-lg">
      <Link href={`/agent/packages/${id}`} className="text-label text-link underline">
        Back to the package
      </Link>
      <h1 className="font-heading text-heading-lg">
        Compare offers{pkg.data ? `: ${pkg.data.property.streetLine}` : ""}
      </h1>
      {comparison.isError && (
        <ErrorNotice error={describeError(comparison.error, "The offers could not be loaded.")} />
      )}
      {error && <ErrorNotice error={error} />}
      {!open && pkg.data && (
        <p role="status" className="rounded-control border border-default bg-card p-inset-md">
          This package is no longer taking decisions on offers.{" "}
          <Link href={`/agent/packages/${id}/deal`} className="text-link underline">
            See the deal
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-inline-md">
        <Select
          label="Sort by"
          options={SORTS}
          selectedKey={sort}
          onSelectionChange={(key) => setSort(key as ComparisonSort)}
        />
        {open && pkg.data && (comparison.data?.rows.length ?? 0) > 0 && (
          <DeclineAllDialog version={pkg.data.version} onDecide={decide} isDisabled={isBusy} />
        )}
      </div>
      {comparison.data && (
        <p className="text-label text-muted">
          Net proceeds subtract the investor&apos;s fees and concessions, closing costs of{" "}
          {+(comparison.data.assumptions.closingCostPct * 100).toFixed(2)}% of the price, and{" "}
          {formatUsd(comparison.data.assumptions.flatFees)} in flat fees. Press a figure to see its
          breakdown.
        </p>
      )}
      {comparison.data?.rows.length === 0 && <p className="text-muted">No offers to compare.</p>}
      {(comparison.data?.rows.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-card bg-card p-inset-md shadow-card">
          <table className="w-full border-collapse">
            <caption className="sr-only">
              Offers, sorted by {SORTS.find((option) => option.id === sort)?.label.toLowerCase()}
            </caption>
            <thead>
              <tr>
                {[
                  "Investor",
                  "Price",
                  "Net proceeds",
                  "Closing",
                  "Payment",
                  "Contingencies",
                  "Earnest money",
                  "Expires",
                  "Status",
                  "Decision",
                ].map((h) => (
                  <th key={h} scope="col" className={`${CELL} text-label text-muted`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.data?.rows.map((row) => (
                <tr key={row.offer.id}>
                  <th scope="row" className={CELL}>
                    {row.investorName}
                  </th>
                  <td className={CELL}>{formatUsd(row.offer.price)}</td>
                  <td className={CELL}>
                    <Breakdown row={row} />
                  </td>
                  <td className={CELL}>{row.offer.closingDate}</td>
                  <td className={CELL}>{row.offer.paymentType === "CASH" ? "Cash" : "Financed"}</td>
                  <td className={CELL}>
                    {row.offer.contingencies.map(lower).join(", ") || "None"}
                  </td>
                  <td className={CELL}>{formatUsd(row.offer.earnestMoney)}</td>
                  <td className={CELL}>
                    {row.expired ? (
                      <strong>Expired</strong>
                    ) : (
                      new Date(row.offer.expiresAt).toLocaleString()
                    )}
                  </td>
                  <td className={CELL}>{OFFER_STATUS_LABELS[row.offer.status]}</td>
                  <td className={CELL}>
                    {row.acceptable ? (
                      <div className="flex flex-wrap gap-inline-sm">
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
