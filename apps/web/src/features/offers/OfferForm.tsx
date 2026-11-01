"use client";
// The offer form (T302; FR-042): every term, filled in from the investor's offer when they revise
// it. Each input is named by its api field, so an api error shows on its field.
import { CONTINGENCIES, type CreateOfferInput, type OfferView } from "@clever/contracts/offer";
import { Button, CheckboxGroup, NumberField, Select, TextField } from "@clever/ui";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { useOfferForm } from "./useOfferForm";

const USD = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;
const paymentOptions = [
  { id: "CASH", label: "Cash" },
  { id: "FINANCED", label: "Financed" },
];
const contingencyOptions = CONTINGENCIES.map((id) => ({
  id,
  label: id.charAt(0) + id.slice(1).toLowerCase().replaceAll("_", " "),
}));
/** `YYYY-MM-DDTHH:mm` in local time, what a datetime-local input shows. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function OfferForm({
  packageId,
  myOffer,
  deadline,
}: {
  packageId: string;
  myOffer: OfferView | null;
  deadline: string | null;
}) {
  const { submit, isPending, fieldErrors, error, saved } = useOfferForm(packageId, myOffer);
  const [paymentType, setPaymentType] = useState<string>(myOffer?.paymentType ?? "CASH");
  const revising = myOffer?.status === "ACTIVE";

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
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
    >
      <h2 className="font-heading text-heading-sm">
        {revising ? "Revise your offer" : "Make an offer"}
      </h2>
      {revising && (
        <p className="text-label text-muted">
          You are on revision {myOffer.revision}. A revision restates every term.
        </p>
      )}
      {error && <ErrorNotice error={error} />}
      {saved && (
        <p role="status" className="rounded-control border border-default p-inset-md">
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
      <Select
        name="paymentType"
        label="Payment"
        options={paymentOptions}
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
      <CheckboxGroup
        name="contingencies"
        label="Contingencies"
        description={paymentType === "FINANCED" ? "A financed offer needs Financing." : undefined}
        options={contingencyOptions}
        defaultValue={myOffer?.contingencies}
        errorMessage={fieldErrors.contingencies}
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
      <TextField
        name="expiresAt"
        type="datetime-local"
        label="Offer expires"
        defaultValue={toLocalInput(myOffer?.expiresAt ?? deadline ?? new Date().toISOString())}
        errorMessage={fieldErrors.expiresAt}
        isRequired
      />
      <div>
        <Button type="submit" isPending={isPending}>
          {revising ? "Send revision" : "Send offer"}
        </Button>
      </div>
    </form>
  );
}
