// The current import batch (T325, T332): its file, status, and start time; the rows, imported,
// updated, and rejected counts once it is done; the columns it ignored; and every row's result with
// its reason. Only the status is announced, politely; the running row count is not.
import type { ImportBatchView } from "@clever/contracts/investor";
import { Card, IMPORT_OUTCOME_TONES, IMPORT_STATUS_TONES, StatTile, StatusChip } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";

const STATUS_TEXT: Record<ImportBatchView["status"], string> = {
  QUEUED: "Waiting to start",
  RUNNING: "Importing",
  COMPLETED: "Finished",
  FAILED: "Failed",
};
const OUTCOME_TEXT = { IMPORTED: "Imported", UPDATED: "Updated", REJECTED: "Rejected" } as const;
const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function ImportBatchCard({ batch }: { batch: ImportBatchView }) {
  const done = batch.status === "COMPLETED" || batch.status === "FAILED";
  const counted = done && batch.error === null;
  return (
    <Card
      title={batch.fileName}
      description={
        <>
          Started <time dateTime={batch.createdAt}>{formatTime(batch.createdAt)}</time>
        </>
      }
      actions={<StatusChip tone={IMPORT_STATUS_TONES[batch.status]}>{STATUS_TEXT[batch.status]}</StatusChip>}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {STATUS_TEXT[batch.status]}
        {counted
          ? `: ${batch.imported} imported, ${batch.updated} updated, ${batch.rejected} rejected.`
          : "."}
      </p>
      {!done && batch.processedRows > 0 && (
        <p className="text-body text-muted">{batch.processedRows} rows done so far</p>
      )}
      {batch.error && <ErrorNotice error={{ message: batch.error }} />}
      {counted && (
        <div className="grid grid-cols-2 gap-inline-md sm:grid-cols-4">
          <StatTile label="Rows" value={batch.totalRows ?? batch.processedRows} />
          <StatTile
            label={OUTCOME_TEXT.IMPORTED}
            value={batch.imported}
            tone={IMPORT_OUTCOME_TONES.IMPORTED}
          />
          <StatTile
            label={OUTCOME_TEXT.UPDATED}
            value={batch.updated}
            tone={IMPORT_OUTCOME_TONES.UPDATED}
          />
          <StatTile
            label={OUTCOME_TEXT.REJECTED}
            value={batch.rejected}
            tone={IMPORT_OUTCOME_TONES.REJECTED}
          />
        </div>
      )}
      {batch.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-body">
            <caption className="sr-only">Each row of the file and what happened to it</caption>
            <thead>
              <tr className="border-b border-default text-helper text-muted">
                <th scope="col" className="py-inset-sm pr-inset-md font-semibold">
                  Row
                </th>
                <th scope="col" className="px-inset-md py-inset-sm font-semibold">
                  Result
                </th>
                <th scope="col" className="py-inset-sm pl-inset-md font-semibold">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {batch.rows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-subtle">
                  <td className="py-inset-sm pr-inset-md text-muted">{row.rowNumber}</td>
                  <td className="px-inset-md py-inset-sm">
                    <StatusChip tone={IMPORT_OUTCOME_TONES[row.outcome]}>
                      {OUTCOME_TEXT[row.outcome]}
                    </StatusChip>
                  </td>
                  <td className="py-inset-sm pl-inset-md">{row.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {batch.ignoredColumns.length > 0 && (
        <p className="text-helper text-muted">Columns ignored: {batch.ignoredColumns.join(", ")}</p>
      )}
    </Card>
  );
}
