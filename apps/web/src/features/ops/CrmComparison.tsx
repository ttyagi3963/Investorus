"use client";
// The CRM beside the platform (T342; FR-078): for each package, the platform's status, the stand-in
// CRM's status, whether they agree, and the unsent CRM delivery that explains a difference.
import type { CrmComparisonRow } from "@clever/contracts/ops";
import { Card, PACKAGE_STATUS_TONES, StatusChip } from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS } from "@/features/listing-package/labels";
import { describeError } from "@/lib/errors";
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_TONES } from "./labels";
import { useCrmComparison } from "./queries";

const HEAD = "px-inset-md py-inset-md text-left text-label text-muted";
const CELL = "px-inset-md py-inset-md align-middle text-body";

const crmStatusText = (status: string | null) =>
  status === null ? "No record" : (STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status);

function ComparisonRow({ row }: { row: CrmComparisonRow }) {
  return (
    <tr className="border-t border-subtle">
      <th scope="row" className={`${CELL} text-left`}>
        <Link
          href={`/ops/packages/${row.packageId}`}
          className="font-semibold text-heading hover:text-link hover:underline"
        >
          {row.streetLine}
        </Link>
      </th>
      <td className={CELL}>
        <StatusChip tone={PACKAGE_STATUS_TONES[row.platformStatus]}>
          {STATUS_LABELS[row.platformStatus]}
        </StatusChip>
      </td>
      <td className={`${CELL} ${row.crmStatus === null ? "text-muted" : "text-default"}`}>
        {crmStatusText(row.crmStatus)}
      </td>
      <td className={CELL}>
        {row.inSync ? (
          <StatusChip tone="under-contract">In sync</StatusChip>
        ) : (
          <StatusChip tone="error">Out of sync</StatusChip>
        )}
      </td>
      <td className={CELL}>
        {row.pendingDelivery ? (
          <div className="flex flex-wrap items-center gap-inline-sm">
            <StatusChip tone={DELIVERY_STATUS_TONES[row.pendingDelivery.status]}>
              {DELIVERY_STATUS_LABELS[row.pendingDelivery.status]}
            </StatusChip>
            <Link
              href={`/ops/deliveries?status=${row.pendingDelivery.status}`}
              className="text-helper text-link hover:text-link-hover hover:underline"
            >
              See deliveries
            </Link>
          </div>
        ) : (
          <span className="text-muted">None</span>
        )}
      </td>
    </tr>
  );
}

export function CrmComparison() {
  const { data: rows, isPending, isError, error } = useCrmComparison();
  return (
    <>
      {isPending && <p role="status">Loading the CRM comparison…</p>}
      {isError && (
        <ErrorNotice error={describeError(error, "The CRM comparison could not be loaded.")} />
      )}
      {rows?.length === 0 && (
        <Card>
          <p className="text-body-lg text-muted">
            No packages yet, so there is nothing to compare.
          </p>
        </Card>
      )}
      {rows && rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl border-collapse">
              <caption className="sr-only">Platform status beside the CRM's record</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Property
                  </th>
                  <th scope="col" className={HEAD}>
                    Platform status
                  </th>
                  <th scope="col" className={HEAD}>
                    CRM status
                  </th>
                  <th scope="col" className={HEAD}>
                    In sync
                  </th>
                  <th scope="col" className={HEAD}>
                    Pending delivery
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ComparisonRow key={row.packageId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
