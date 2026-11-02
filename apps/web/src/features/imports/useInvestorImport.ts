// Importing the legacy investor file (T325; FR-061): the file is checked for type and size first,
// uploaded straight to storage with the signed instruction the api issues (never through the BFF),
// and then the import is started; the batch is then followed until it finishes. The batch ID lives in
// the address (?batch=...), so a reload or a trip back to the page still shows it (T385). The api
// checks the file again, and reads it in a background job.
import { MAX_IMPORT_BYTES } from "@clever/contracts/investor";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { investorImports } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";

const POLL_MS = 1_000;

function problemWith(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return `${file.name}: choose a CSV file.`;
  if (file.size > MAX_IMPORT_BYTES) {
    return `${file.name}: the limit is ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

export function useInvestorImport() {
  const router = useRouter();
  const pathname = usePathname();
  // Anyone can edit the address, and the ID goes into a request path: a batch ID is letters and
  // digits, so only that is followed.
  const param = useSearchParams().get("batch");
  const batchId = param && /^\w+$/.test(param) ? param : null;
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
      router.replace(`${pathname}?batch=${encodeURIComponent(started.batchId)}`);
    } catch (err) {
      setError(describeError(err, "The import could not be started. Try again."));
    } finally {
      setUploading(false);
    }
  }

  return { upload, isUploading, error, batch };
}
