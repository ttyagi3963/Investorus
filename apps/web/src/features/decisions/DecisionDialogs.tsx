"use client";
// The seller's decision as the agent records it (T315; FR-052): accept one offer after a
// confirmation, counter one with new terms, or decline every open offer with an optional note.
// Each dialog moves focus in and back and works from the keyboard; nothing changes on screen until
// the api answers (never optimistic, XIII). Payment type and contingencies stay as the investor
// offered them; a counter changes the money, the dates, and the expiry.
import type { CreateDecisionInput } from "@clever/contracts/deal";
import type { OfferView } from "@clever/contracts/offer";
import { ConfirmDialog, FormDialog, NumberField, TextField } from "@clever/ui";
import { formatUsd } from "@/features/listing-package/labels";

const USD = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;
/** `YYYY-MM-DDTHH:mm` in local time, what a datetime-local input shows. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const amount = (values: FormData, name: string) =>
  Number(String(values.get(name) ?? "").replace(/[^0-9.]/g, ""));

type Decide = (input: CreateDecisionInput) => void;

export function AcceptButton({
  offer,
  investorName,
  onDecide,
  isDisabled,
}: {
  offer: OfferView;
  investorName: string;
  onDecide: Decide;
  isDisabled?: boolean;
}) {
  return (
    <ConfirmDialog
      triggerLabel="Accept"
      title={`Accept ${investorName}'s offer?`}
      message={`${formatUsd(offer.price)}, closing ${offer.closingDate}. The other open offers become backup offers, and every investor is told.`}
      confirmLabel="Yes, accept"
      cancelLabel="Not yet"
      onConfirm={() => onDecide({ type: "ACCEPT", offerId: offer.id, version: offer.version })}
      isDisabled={isDisabled}
    />
  );
}

export function CounterDialog({
  offer,
  investorName,
  onDecide,
  isDisabled,
}: {
  offer: OfferView;
  investorName: string;
  onDecide: Decide;
  isDisabled?: boolean;
}) {
  return (
    <FormDialog
      triggerLabel="Counter"
      title={`Counter ${investorName}'s offer`}
      submitLabel="Send counter-offer"
      cancelLabel="Cancel"
      isDisabled={isDisabled}
      onSubmit={(values) =>
        onDecide({
          type: "COUNTER",
          offerId: offer.id,
          version: offer.version,
          counterTerms: {
            price: amount(values, "price"),
            paymentType: offer.paymentType,
            closingDate: String(values.get("closingDate") ?? ""),
            earnestMoney: amount(values, "earnestMoney"),
            contingencies: offer.contingencies,
            feesAndConcessions: amount(values, "feesAndConcessions"),
            expiresAt: new Date(String(values.get("expiresAt"))).toISOString(),
          },
        })
      }
    >
      <NumberField
        name="price"
        label="Price"
        minValue={1}
        formatOptions={USD}
        defaultValue={offer.price}
        isRequired
      />
      <TextField
        name="closingDate"
        type="date"
        label="Closing date"
        defaultValue={offer.closingDate}
        isRequired
      />
      <NumberField
        name="earnestMoney"
        label="Earnest money"
        minValue={0}
        formatOptions={USD}
        defaultValue={offer.earnestMoney}
        isRequired
      />
      <NumberField
        name="feesAndConcessions"
        label="Fees and concessions"
        minValue={0}
        formatOptions={USD}
        defaultValue={offer.feesAndConcessions}
        isRequired
      />
      <TextField
        name="expiresAt"
        type="datetime-local"
        label="Counter expires"
        defaultValue={toLocalInput(offer.expiresAt)}
        isRequired
      />
    </FormDialog>
  );
}

export function DeclineAllDialog({
  version,
  onDecide,
  isDisabled,
}: {
  version: number;
  onDecide: Decide;
  isDisabled?: boolean;
}) {
  return (
    <FormDialog
      triggerLabel="Decline all"
      title="Decline every open offer?"
      submitLabel="Decline all offers"
      cancelLabel="Keep them"
      isDisabled={isDisabled}
      onSubmit={(values) => {
        const note = String(values.get("note") ?? "").trim();
        onDecide({ type: "DECLINE_ALL", version, ...(note && { note }) });
      }}
    >
      <p>Each investor is told their offer was declined.</p>
      <TextField
        name="note"
        label="Note for your records (optional)"
        description="Only you see this note."
      />
    </FormDialog>
  );
}
