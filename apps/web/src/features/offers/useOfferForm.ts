// Making or revising an offer (T302; XX.2, FR-042): one request at a time. The client keeps the
// Idempotency-Key of the same terms until the api settles them (T381), so a retry after a lost
// answer is a replay, never a second offer; changed terms are a new action with a new key. The
// api's field errors are keyed by field name, which is each input's name.
import type { OfferView } from "@clever/contracts/offer";
import type { CreateOfferInput } from "@clever/contracts/offer";
import { ApiError } from "@clever/contracts/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { investor } from "../../lib/bff-client";
import { describeError, type ErrorInfo } from "../../lib/errors";
import { investorKeys } from "./queries";

export function useOfferForm(packageId: string, myOffer: OfferView | null) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
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
    try {
      if (myOffer?.status === "ACTIVE" || myOffer?.status === "COUNTERED") {
        await investor.reviseOffer(myOffer.id, { ...terms, version: myOffer.version });
      } else {
        await investor.makeOffer(packageId, terms);
      }
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: investorKeys.all });
    } catch (err) {
      if (err instanceof ApiError) {
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
