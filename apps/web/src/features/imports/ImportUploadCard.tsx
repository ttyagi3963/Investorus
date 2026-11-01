// The "New import" card (T325, T332): the CSV chooser on a dashed drop-style area, with the file
// limit and what an import does, and any problem with the chosen file or the upload under it.
import { MAX_IMPORT_BYTES } from "@clever/contracts/investor";
import { Card, PhotoPicker } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import type { ErrorInfo } from "@/lib/errors";

const LIMIT_MB = MAX_IMPORT_BYTES / (1024 * 1024);

export type ImportUploadCardProps = {
  onChoose: (file: File) => void;
  isUploading: boolean;
  error: ErrorInfo | null;
};

export function ImportUploadCard({ onChoose, isUploading, error }: ImportUploadCardProps) {
  return (
    <Card title="New import">
      <div className="flex flex-col items-center gap-stack-sm rounded-card border-2 border-dashed border-empty bg-page px-inset-md py-inset-xl text-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-7 text-link"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        <PhotoPicker
          label={isUploading ? "Uploading…" : "Choose the CSV file to import"}
          acceptedTypes={[".csv", "text/csv"]}
          isDisabled={isUploading}
          onSelect={([file]) => file && onChoose(file)}
        />
        <p className="text-helper text-muted">
          CSV up to {LIMIT_MB} MB. Each valid row creates or updates the investor and their one
          default buy box, named Legacy Import. Importing the same file again creates no duplicates.
        </p>
      </div>
      {error && <ErrorNotice error={error} />}
    </Card>
  );
}
