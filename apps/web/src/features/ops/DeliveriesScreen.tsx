"use client";
// The failed-jobs screen (T342; FR-071): the outbox's deliveries filtered by status (needs attention
// by default, kept in ?status= so the view can be linked), each with its target, recipient, event,
// attempts, last error, and next try, and a retry for one that used up its retries.
import type { DeliveryStatus } from "@clever/contracts/events";
import type { DeliveryView } from "@clever/contracts/ops";
import { Button, Card, Select, StatusChip } from "@clever/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { formatLocalTime } from "@/lib/local-time";
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_TONES, TARGET_LABELS, eventLabel } from "./labels";
import { useDeliveries, useRetryDelivery } from "./queries";

type Filter = DeliveryStatus | "ALL";
type FilterOption = { id: Filter; label: string; empty: string };
const NEEDS_ATTENTION: FilterOption = {
  id: "NEEDS_ATTENTION",
  label: "Needs attention",
  empty: "Nothing needs attention: every delivery went through or is still being tried.",
};
const FILTERS: FilterOption[] = [
  NEEDS_ATTENTION,
  { id: "RETRYING", label: "Retrying", empty: "No delivery is waiting to be tried again." },
  { id: "PENDING", label: "Pending", empty: "No delivery is waiting to be sent." },
  { id: "SENT", label: "Sent", empty: "Nothing has been sent yet." },
  { id: "ALL", label: "All", empty: "No deliveries yet." },
];

const HEAD = "px-inset-sm py-inset-sm text-left text-helper font-semibold text-muted";
const CELL = "px-inset-sm py-inset-md align-top text-body";

/** The filter in the address, or "needs attention" when there is none or it is unknown. */
const readFilter = (value: string | null) =>
  FILTERS.find((option) => option.id === value) ?? NEEDS_ATTENTION;

function DeliveryRow({
  delivery,
  onRetry,
  isRetrying,
}: {
  delivery: DeliveryView;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <tr className="border-t border-subtle">
      <td className={`${CELL} whitespace-nowrap text-muted`}>
        <time dateTime={delivery.createdAt}>{formatLocalTime(delivery.createdAt)}</time>
      </td>
      <td className={CELL}>{TARGET_LABELS[delivery.target]}</td>
      <th scope="row" className={`${CELL} text-left font-semibold text-heading`}>
        {delivery.recipient}
      </th>
      <td className={CELL}>
        <div className="flex flex-col gap-stack-xs">
          <span>{eventLabel(delivery.eventType)}</span>
          {delivery.packageId && (
            <Link
              href={`/ops/packages/${delivery.packageId}`}
              className="text-helper text-link hover:text-link-hover hover:underline"
            >
              Package trace
            </Link>
          )}
        </div>
      </td>
      <td className={CELL}>
        <StatusChip tone={DELIVERY_STATUS_TONES[delivery.status]}>
          {DELIVERY_STATUS_LABELS[delivery.status]}
        </StatusChip>
      </td>
      <td className={`${CELL} text-right tabular-nums`}>{delivery.attempts}</td>
      <td className={`${CELL} text-helper text-muted`}>{delivery.lastError ?? "None"}</td>
      <td className={`${CELL} whitespace-nowrap text-muted`}>
        {delivery.nextAttemptAt ? (
          <time dateTime={delivery.nextAttemptAt}>{formatLocalTime(delivery.nextAttemptAt)}</time>
        ) : (
          "None"
        )}
      </td>
      <td className={`${CELL} text-right`}>
        {delivery.status === "NEEDS_ATTENTION" && (
          <Button size="sm" variant="secondary" onPress={onRetry} isPending={isRetrying}>
            Retry
          </Button>
        )}
      </td>
    </tr>
  );
}

export function DeliveriesScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const current = readFilter(useSearchParams().get("status"));
  const filter = current.id;
  const deliveries = useDeliveries(filter === "ALL" ? undefined : filter);
  const retry = useRetryDelivery();
  const [notice, setNotice] = useState("");

  function choose(next: Filter) {
    setNotice("");
    router.replace(next === NEEDS_ATTENTION.id ? pathname : `${pathname}?status=${next}`);
  }

  function retryOne(delivery: DeliveryView) {
    setNotice("");
    retry.mutate(delivery.id, {
      onSuccess: () => setNotice(`The delivery to ${delivery.recipient} is queued to retry.`),
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-inline-md">
        <div className="w-full sm:w-64">
          <Select
            label="Status"
            options={FILTERS}
            selectedKey={filter}
            onSelectionChange={(key) => choose(key as Filter)}
          />
        </div>
        <p role="status" className="text-body text-muted">
          {notice}
        </p>
      </div>
      {retry.isError && (
        <ErrorNotice error={describeError(retry.error, "The delivery could not be retried.")} />
      )}
      {deliveries.isPending && <p role="status">Loading the deliveries…</p>}
      {deliveries.isError && (
        <ErrorNotice
          error={describeError(deliveries.error, "The deliveries could not be loaded.")}
        />
      )}
      {deliveries.data?.length === 0 && <p className="text-body text-muted">{current.empty}</p>}
      {deliveries.data && deliveries.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-5xl border-collapse">
            <caption className="sr-only">Deliveries: {current.label.toLowerCase()}</caption>
            <thead>
              <tr>
                <th scope="col" className={HEAD}>
                  Created
                </th>
                <th scope="col" className={HEAD}>
                  Target
                </th>
                <th scope="col" className={HEAD}>
                  Recipient
                </th>
                <th scope="col" className={HEAD}>
                  Event
                </th>
                <th scope="col" className={HEAD}>
                  Status
                </th>
                <th scope="col" className={`${HEAD} text-right`}>
                  Attempts
                </th>
                <th scope="col" className={HEAD}>
                  Last error
                </th>
                <th scope="col" className={HEAD}>
                  Next try
                </th>
                <th scope="col" className={HEAD}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {deliveries.data.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  onRetry={() => retryOne(delivery)}
                  isRetrying={retry.isPending && retry.variables === delivery.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
