"use client";
// The investor import page (T325; FR-061, contracts/investor-import.md): operations choose the
// legacy CSV, which is uploaded and imported in the background; the page follows the batch and
// shows how many rows were imported, updated, and rejected, the columns it ignored, and every
// row's result with its reason. Progress is announced politely, not on every refresh.
import type { ImportBatchView } from "@clever/contracts/investor";
import { PhotoPicker } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { useInvestorImport } from "@/features/imports/useInvestorImport";
import { describeError } from "@/lib/errors";

const STATUS_TEXT: Record<ImportBatchView["status"], string> = {
  QUEUED: "Waiting to start",
  RUNNING: "Importing",
  COMPLETED: "Finished",
  FAILED: "Failed",
};
const OUTCOME_TEXT = { IMPORTED: "Imported", UPDATED: "Updated", REJECTED: "Rejected" } as const;

function Summary({ batch }: { batch: ImportBatchView }) {
  const done = batch.status === "COMPLETED" || batch.status === "FAILED";
  return (
    <section
      aria-label="Import result"
      className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
    >
      <h2 className="font-heading text-heading-sm">{batch.fileName}</h2>
      <p role="status" aria-live="polite">
        {STATUS_TEXT[batch.status]}
        {!done && batch.totalRows === null && batch.processedRows > 0
          ? ` (${batch.processedRows} rows so far)`
          : ""}
        {done && batch.error === null
          ? `: ${batch.imported} imported, ${batch.updated} updated, ${batch.rejected} rejected.`
          : "."}
      </p>
      {batch.error && <ErrorNotice error={{ message: batch.error }} />}
      {batch.ignoredColumns.length > 0 && (
        <p className="text-label text-muted">Columns ignored: {batch.ignoredColumns.join(", ")}</p>
      )}
      {batch.rows.length > 0 && (
        <table className="w-full border-collapse text-left text-body">
          <caption className="sr-only">Each row of the file and what happened to it</caption>
          <thead>
            <tr className="border-b border-default">
              <th scope="col" className="p-inset-sm">
                Row
              </th>
              <th scope="col" className="p-inset-sm">
                Result
              </th>
              <th scope="col" className="p-inset-sm">
                Reason
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((row) => (
              <tr key={row.rowNumber} className="border-b border-default">
                <td className="p-inset-sm">{row.rowNumber}</td>
                <td className="p-inset-sm">{OUTCOME_TEXT[row.outcome]}</td>
                <td className="p-inset-sm">{row.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function ImportInvestorsPage() {
  const { upload, isUploading, error, batch } = useInvestorImport();

  return (
    <div className="flex max-w-4xl flex-col gap-stack-lg">
      <h1 className="font-heading text-heading-lg">Import investors</h1>
      <p>
        Upload the investor list exported from the spreadsheet as CSV, up to 5 MB. Each valid row
        creates or updates the investor and their one default buy box, named Legacy Import; each
        invalid row is listed with its reason. Importing the same file again updates the same
        investors and creates no duplicates.
      </p>
      <div>
        <PhotoPicker
          label={isUploading ? "Uploading…" : "Choose the CSV file to import"}
          acceptedTypes={[".csv", "text/csv"]}
          isDisabled={isUploading}
          onSelect={([file]) => file && void upload(file)}
        />
      </div>
      {error && <ErrorNotice error={error} />}
      {batch.isError && (
        <ErrorNotice error={describeError(batch.error, "The import could not be loaded.")} />
      )}
      {batch.data && <Summary batch={batch.data} />}
    </div>
  );
}
