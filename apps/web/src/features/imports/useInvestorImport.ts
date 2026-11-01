// Importing the legacy investor file (T325; FR-061): the file is checked for type and size first,
// uploaded straight to storage with the signed instruction the api issues (never through the BFF),
// and then the import is started; the batch is then followed until it finishes. The api checks the
// file again, and reads it in a background job.
import { MAX_IMPORT_BYTES } from "@clever/contracts/investor";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { investorImports } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";

const POLL_MS = 1_000;

function problemWith(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return `${file.name}: choose a CSV file.`;
  if (file.size > MAX_IMPORT_BYTES) return `${file.name}: the limit is 5 MB.`;
  return null;
}

export function useInvestorImport() {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const batch = useQuery({
    queryKey: ["investor-imports", batchId],
    queryFn: () => investorImports.get(batchId!),
    enabled: batchId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "COMPLETED" || status === "FAILED" ? false : POLL_MS;
    },
  });

  async function upload(file: File): Promise<void> {
    setError(null);
    const problem = problemWith(file);
    if (problem) return setError({ message: problem });
    setUploading(true);
    try {
      const { storageKey, upload: instruction } = await investorImports.requestUpload(file.size);
      const stored = await fetch(instruction.url, {
        method: instruction.method,
        headers: instruction.headers,
        body: file,
      });
      if (!stored.ok) throw new Error(`${file.name} could not be uploaded. Try again.`);
      const started = await investorImports.start({ storageKey, fileName: file.name });
      setBatchId(started.batchId);
    } catch (err) {
      setError(describeError(err, "The import could not be started. Try again."));
    } finally {
      setUploading(false);
    }
  }

  return { upload, isUploading, error, batch };
}
