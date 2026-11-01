// Saving a buy box (T324; XX.2, FR-060): one request at a time, and one Idempotency-Key per action,
// kept until an answer arrives, so a retry after a lost answer replays instead of saving twice. A
// new box opens its own page once saved. The api's field errors are keyed by field name, which is
// each input's name.
import type { BuyBoxInput, BuyBoxView } from "@clever/contracts/buy-box";
import { ApiError } from "@clever/contracts/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { buyBoxes } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { buyBoxKeys } from "./queries";

const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

export function useBuyBoxForm(existing: BuyBoxView | undefined) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const inFlight = useRef(false);
  // The key and the box it was sent with: a retry reuses it only for the same box.
  const actionKey = useRef<{ key: string; box: string } | null>(null);
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
    const sent = JSON.stringify(box);
    if (actionKey.current?.box !== sent) actionKey.current = { key: newKey(), box: sent };
    const options = { idempotencyKey: actionKey.current.key };
    try {
      if (existing) {
        await buyBoxes.save(existing.id, { ...box, version: existing.version }, options);
        setSaved(true);
      } else {
        const created = await buyBoxes.create(box, options);
        router.replace(`/investor/buy-boxes/${created.id}`);
      }
      actionKey.current = null;
      await queryClient.invalidateQueries({ queryKey: buyBoxKeys.all });
    } catch (err) {
      // An answer arrived, so the next press is a new action; a lost answer keeps the key.
      if (err instanceof ApiError) {
        actionKey.current = null;
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
