"use client";
// Every package for operations (T342; FR-073): the address linking to its trace, the status, how many
// investors matched and offered, and whether any delivery is in trouble, so a failing package stands
// out before anyone opens it.
import type { OpsPackageRow } from "@clever/contracts/ops";
import { Card, PACKAGE_STATUS_TONES, StatusChip } from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS } from "@/features/listing-package/labels";
import { describeError } from "@/lib/errors";
import { formatLocalTime } from "@/lib/local-time";
import { useOpsPackages } from "./queries";

const HEAD = "px-inset-md py-inset-md text-left text-label text-muted";
const CELL = "px-inset-md py-inset-md align-middle";
const NUMBER = "text-right tabular-nums";

function DeliveryTrouble({ deliveries }: { deliveries: OpsPackageRow["deliveries"] }) {
  if (deliveries.needsAttention === 0 && deliveries.retrying === 0) {
    return <span className="text-body text-muted">All sent</span>;
  }
  return (
    <div className="flex flex-wrap gap-inline-sm">
      {deliveries.needsAttention > 0 && (
        <StatusChip tone="error">
          {deliveries.needsAttention} {deliveries.needsAttention === 1 ? "needs" : "need"} attention
        </StatusChip>
      )}
      {deliveries.retrying > 0 && (
        <StatusChip tone="offers-in">{deliveries.retrying} retrying</StatusChip>
      )}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: OpsPackageRow }) {
  return (
    <tr className="border-t border-subtle">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        <div className="flex flex-col gap-stack-xs">
          <Link
            href={`/ops/packages/${pkg.id}`}
            className="text-body-lg font-semibold text-heading hover:text-link hover:underline"
          >
            {pkg.streetLine}
          </Link>
          <span className="text-helper text-muted">
            {pkg.city}, {pkg.state} {pkg.zip}
          </span>
        </div>
      </th>
      <td className={CELL}>
        <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>{STATUS_LABELS[pkg.status]}</StatusChip>
      </td>
      <td className={`${CELL} ${NUMBER} text-body-lg`}>{pkg.matchedCount}</td>
      <td className={`${CELL} ${NUMBER} text-body-lg`}>{pkg.offerCount}</td>
      <td className={CELL}>
        <DeliveryTrouble deliveries={pkg.deliveries} />
      </td>
      <td className={`${CELL} text-body text-muted`}>
        <time dateTime={pkg.updatedAt}>{formatLocalTime(pkg.updatedAt)}</time>
      </td>
    </tr>
  );
}

export function PackagesTable() {
  const { data: packages, isPending, isError, error } = useOpsPackages();

  return (
    <>
      {isPending && <p role="status">Loading the packages…</p>}
      {isError && <ErrorNotice error={describeError(error, "The packages could not be loaded.")} />}
      {packages?.length === 0 && (
        <Card>
          <p className="text-body-lg text-muted">
            No packages yet. Once an agent creates one, it appears here with its deliveries.
          </p>
        </Card>
      )}
      {packages && packages.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse">
              <caption className="sr-only">Every listing package and its deliveries</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Property
                  </th>
                  <th scope="col" className={HEAD}>
                    Status
                  </th>
                  <th scope="col" className={`${HEAD} text-right`}>
                    Matched
                  </th>
                  <th scope="col" className={`${HEAD} text-right`}>
                    Offers
                  </th>
                  <th scope="col" className={HEAD}>
                    Deliveries
                  </th>
                  <th scope="col" className={HEAD}>
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <PackageRow key={pkg.id} pkg={pkg} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
