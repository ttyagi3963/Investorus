"use client";
// The console's bulk actions (T342; FR-071): retry every delivery that needs attention (or only one
// package's, on its trace), and, on the deliveries page, send the daily match digests now. One line under the buttons says politely what
// the api queued (role="status"); a refusal shows with its request ID. The trace hides its retry
// button once nothing needs attention but stays mounted, so the line still says what was queued.
import { Button } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { useRetryAll, useSendDigests } from "./queries";

const deliveries = (count: number) => (count === 1 ? "1 delivery" : `${count} deliveries`);

export function BulkActions({
  retryLabel,
  digests,
  packageId,
  canRetry = true,
}: {
  retryLabel: string;
  digests?: boolean;
  /** Only this package's deliveries; all of them when absent. */
  packageId?: string;
  /** False hides the retry button, keeping the line that says what the last retry queued. */
  canRetry?: boolean;
}) {
  const retryAll = useRetryAll(packageId ? { packageId } : {});
  const send = useSendDigests();
  const retried = retryAll.data;
  return (
    <div className="flex flex-col items-end gap-stack-xs">
      <div className="flex flex-wrap gap-inline-md">
        {digests && (
          <Button variant="secondary" onPress={() => send.mutate()} isPending={send.isPending}>
            Send digests now
          </Button>
        )}
        {canRetry && (
          <Button onPress={() => retryAll.mutate()} isPending={retryAll.isPending}>
            {retryLabel}
          </Button>
        )}
      </div>
      <p role="status" className="text-helper text-muted">
        {send.data && `The daily digest is queued (job ${send.data.jobId}). `}
        {retried &&
          (retried.count === 0
            ? "Nothing needed a retry."
            : `${deliveries(retried.count)} queued to retry.`)}
      </p>
      {send.isError && (
        <ErrorNotice error={describeError(send.error, "The digests could not be queued.")} />
      )}
      {retryAll.isError && (
        <ErrorNotice error={describeError(retryAll.error, "The retry could not be started.")} />
      )}
    </div>
  );
}
