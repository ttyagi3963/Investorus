"use client";
// The offer form (T302, T331; FR-042): every term, filled in from the investor's offer when they
// revise it, laid out for the package page's "Your offer" card. Each input is named by its api
// field, so an api error shows on its field.
import type { CreateOfferInput, OfferView } from "@clever/contracts/offer";
import { Button, CheckboxGroup, NumberField, Select, TextField } from "@clever/ui";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { CONTINGENCY_OPTIONS, PAYMENT_TYPE_OPTIONS } from "@/features/listing-package/labels";
import { toLocalInput } from "@/lib/local-time";
import { useOfferForm } from "./useOfferForm";

const USD = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;

type OfferFormProps = { packageId: string; myOffer: OfferView | null; deadline: string | null };

/**
 * The fields are keyed on the offer's version, so a send, a counter, or a withdrawal reloads them
 * with the offer's terms. The sending lives out here, outside the key, so "Your offer was sent."
 * survives that reload.
 */
export function OfferForm(props: OfferFormProps) {
  const sending = useOfferForm(props.packageId, props.myOffer);
  return <OfferFields key={props.myOffer?.version ?? 0} {...props} sending={sending} />;
}

function OfferFields({
  myOffer,
  deadline,
  sending,
}: OfferFormProps & { sending: ReturnType<typeof useOfferForm> }) {
  const { submit, isPending, fieldErrors, error, saved } = sending;
  const [paymentType, setPaymentType] = useState<string>(myOffer?.paymentType ?? "CASH");
  // A countered offer is revised too: the revision replaces the counter (FR-052).
  const revising = myOffer?.status === "ACTIVE" || myOffer?.status === "COUNTERED";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = (name: string) => Number(String(form.get(name) ?? "").replace(/[^0-9.]/g, ""));
    const expires = String(form.get("expiresAt") ?? "");
    void submit({
      price: number("price"),
      paymentType: paymentType as CreateOfferInput["paymentType"],
      closingDate: String(form.get("closingDate") ?? ""),
      earnestMoney: number("earnestMoney"),
      contingencies: form.getAll("contingencies").map(String) as CreateOfferInput["contingencies"],
      feesAndConcessions: number("feesAndConcessions"),
      expiresAt: expires ? new Date(expires).toISOString() : "",
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-stack-md">
      {revising && (
        <p className="text-helper text-muted">
          You are on revision {myOffer.revision}. A revision restates every term.
        </p>
      )}
      {error && <ErrorNotice error={error} />}
      {saved && (
        <p
          role="status"
          className="rounded-control bg-status-under-contract p-inset-md text-body text-status-under-contract"
        >
          Your offer was sent.
        </p>
      )}
      <NumberField
        name="price"
        label="Offer price"
        minValue={1}
        formatOptions={USD}
        defaultValue={myOffer?.price}
        errorMessage={fieldErrors.price}
        isRequired
      />
      <div className="grid grid-cols-1 gap-x-inline-md gap-y-stack-md sm:grid-cols-2">
        <Select
          name="paymentType"
          label="Payment"
          options={PAYMENT_TYPE_OPTIONS}
          selectedKey={paymentType}
          onSelectionChange={(key) => setPaymentType(String(key))}
          errorMessage={fieldErrors.paymentType}
          isRequired
        />
        <TextField
          name="closingDate"
          type="date"
          label="Closing date"
          defaultValue={myOffer?.closingDate}
          errorMessage={fieldErrors.closingDate}
          isRequired
        />
        <NumberField
          name="earnestMoney"
          label="Earnest money"
          minValue={0}
          formatOptions={USD}
          defaultValue={myOffer?.earnestMoney ?? 0}
          errorMessage={fieldErrors.earnestMoney}
          isRequired
        />
        <NumberField
          name="feesAndConcessions"
          label="Fees and concessions"
          minValue={0}
          formatOptions={USD}
          defaultValue={myOffer?.feesAndConcessions ?? 0}
          errorMessage={fieldErrors.feesAndConcessions}
          isRequired
        />
      </div>
      <CheckboxGroup
        name="contingencies"
        label="Contingencies"
        description={paymentType === "FINANCED" ? "A financed offer needs Financing." : undefined}
        options={CONTINGENCY_OPTIONS}
        defaultValue={myOffer?.contingencies}
        errorMessage={fieldErrors.contingencies}
      />
      <TextField
        name="expiresAt"
        type="datetime-local"
        label="Offer expires"
        defaultValue={toLocalInput(myOffer?.expiresAt ?? deadline ?? new Date().toISOString())}
        errorMessage={fieldErrors.expiresAt}
        isRequired
      />
      <Button type="submit" variant="cta" fullWidth isPending={isPending}>
        {revising ? "Send revision" : "Send offer"}
      </Button>
    </form>
  );
}
