"use client";
// The seller's decision as the agent records it (T315; FR-052): accept one offer after a
// confirmation, counter one with new terms, or decline every open offer with an optional note.
// Each dialog moves focus in and back and works from the keyboard; nothing changes on screen until
// the api answers (never optimistic, XIII). A counter may change any term the investor offered,
// payment type and contingencies included (FR-041, FR-052; T377).
import type { CreateDecisionInput } from "@clever/contracts/deal";
import type { CreateOfferInput, OfferView } from "@clever/contracts/offer";
import {
  CheckboxGroup,
  ConfirmDialog,
  FormDialog,
  NumberField,
  Select,
  TextField,
} from "@clever/ui";
import { useState } from "react";
import {
  CONTINGENCY_OPTIONS,
  PAYMENT_TYPE_OPTIONS,
  formatUsd,
} from "@/features/listing-package/labels";
import { toLocalInput } from "@/lib/local-time";

const USD = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;
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
      triggerVariant="primary"
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
            paymentType: String(values.get("paymentType")) as CreateOfferInput["paymentType"],
            closingDate: String(values.get("closingDate") ?? ""),
            earnestMoney: amount(values, "earnestMoney"),
            contingencies: values
              .getAll("contingencies")
              .map(String) as CreateOfferInput["contingencies"],
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
      <PaymentAndContingencies offer={offer} />
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

/** How the price is paid and on what conditions, starting from the investor's offer. The dialog
 * mounts its fields on each opening, so a cancelled change does not carry over. */
function PaymentAndContingencies({ offer }: { offer: OfferView }) {
  const [paymentType, setPaymentType] = useState<string>(offer.paymentType);
  return (
    <>
      <Select
        label="Payment"
        options={PAYMENT_TYPE_OPTIONS}
        selectedKey={paymentType}
        onSelectionChange={(key) => setPaymentType(String(key))}
        isRequired
      />
      <input type="hidden" name="paymentType" value={paymentType} />
      <CheckboxGroup
        name="contingencies"
        label="Contingencies"
        description={paymentType === "FINANCED" ? "A financed offer needs Financing." : undefined}
        options={CONTINGENCY_OPTIONS}
        defaultValue={offer.contingencies}
      />
    </>
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
