// Saving a buy box (T324; XX.2, FR-060): one request at a time. The client keeps the
// Idempotency-Key of the same box until the api settles it (T381), so a retry after a lost answer
// replays instead of saving twice. A new box opens its own page once saved. The api's field errors
// are keyed by field name, which is each input's name.
import type { BuyBoxInput, BuyBoxView } from "@clever/contracts/buy-box";
import { ApiError } from "@clever/contracts/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { buyBoxes } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { buyBoxKeys } from "./queries";

export function useBuyBoxForm(existing: BuyBoxView | undefined) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const inFlight = useRef(false);
  const [isPending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(box: BuyBoxInput): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFieldErrors({});
    setError(null);
    setSaved(false);
    try {
      if (existing) {
        await buyBoxes.save(existing.id, { ...box, version: existing.version });
        setSaved(true);
      } else {
        const created = await buyBoxes.create(box);
        router.replace(`/investor/buy-boxes/${created.id}`);
      }
      await queryClient.invalidateQueries({ queryKey: buyBoxKeys.all });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      }
      setError(describeError(err, "The buy box could not be saved. Try again."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { submit, isPending, fieldErrors, error, saved };
}
