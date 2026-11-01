"use client";
// The investor import page (T325, T332; FR-061, contracts/investor-import.md): operations choose the
// legacy CSV, which is uploaded and imported in the background; beside the upload card, the page
// follows the batch and shows its counts, the columns it ignored, and every row's result with its
// reason.
import { Card } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { ImportBatchCard } from "@/features/imports/ImportBatchCard";
import { ImportUploadCard } from "@/features/imports/ImportUploadCard";
import { useInvestorImport } from "@/features/imports/useInvestorImport";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

export default function ImportInvestorsPage() {
  const { upload, isUploading, error, batch } = useInvestorImport();

  return (
    <>
      <PageHeader
        title="Investor imports"
        description="Load investors and their buy boxes from a CSV. Good rows go in, bad rows come back with the reason."
      />
      <div className="grid items-start gap-stack-lg lg:grid-cols-3">
        <ImportUploadCard
          onChoose={(file) => void upload(file)}
          isUploading={isUploading}
          error={error}
        />
        <div className="flex flex-col gap-stack-lg lg:col-span-2">
          {batch.isError && (
            <ErrorNotice error={describeError(batch.error, "The import could not be loaded.")} />
          )}
          {batch.data ? (
            <ImportBatchCard batch={batch.data} />
          ) : (
            !batch.isError && (
              <Card>
                <p className="text-body text-muted">
                  No import yet. Choose a CSV file, and each row&apos;s result appears here.
                </p>
              </Card>
            )
          )}
        </div>
      </div>
    </>
  );
}
