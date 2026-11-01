// Making or revising an offer (T302; XX.2, FR-042): one request at a time, and one Idempotency-Key
// per action. The key is kept until an answer arrives, so a retry after a lost answer is a replay,
// never a second offer. The api's field errors are keyed by field name, which is each input's name.
import type { OfferView } from "@clever/contracts/offer";
import type { CreateOfferInput } from "@clever/contracts/offer";
import { ApiError } from "@clever/contracts/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { investor } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { investorKeys } from "./queries";

const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

export function useOfferForm(packageId: string, myOffer: OfferView | null) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const actionKey = useRef<string | null>(null);
  const [isPending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(terms: CreateOfferInput): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFieldErrors({});
    setError(null);
    setSaved(false);
    actionKey.current ??= newKey();
    const options = { idempotencyKey: actionKey.current };
    try {
      if (myOffer?.status === "ACTIVE") {
        await investor.reviseOffer(myOffer.id, { ...terms, version: myOffer.version }, options);
      } else {
        await investor.makeOffer(packageId, terms, options);
      }
      actionKey.current = null;
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: investorKeys.all });
    } catch (err) {
      // An answer arrived, so the next press is a new action; a lost answer keeps the key.
      if (err instanceof ApiError) {
        actionKey.current = null;
        setFieldErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])));
      }
      setError(describeError(err, "The offer could not be sent. Try again."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { submit, isPending, fieldErrors, error, saved };
}
