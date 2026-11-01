"use client";
// The package form (T270), one form for a new draft and for editing one: seller, property, and
// price sections. Each input is named by its api field path, so an api error shows on its field.
// On edit, an emptied optional field is sent as null (cleared); on create it is left out.
import type {
  AgentPackageView,
  CreateListingPackageInput,
  UpdateListingPackageInput,
} from "@clever/contracts/listing-package";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "@clever/contracts/property";
import { Button, NumberField, Select, TextField } from "@clever/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSavePackage } from "./useSavePackage";

const TYPE_LABELS: Record<(typeof PROPERTY_TYPES)[number], string> = {
  SINGLE_FAMILY: "Single family",
  CONDO: "Condo",
  TOWNHOME: "Townhome",
  MULTI_FAMILY: "Multi-family",
  MANUFACTURED: "Manufactured",
  LAND: "Land",
};
const CONDITION_LABELS: Record<(typeof PROPERTY_CONDITIONS)[number], string> = {
  EXCELLENT: "Excellent",
  GOOD: "Good",
  FAIR: "Fair",
  POOR: "Poor",
  DISTRESSED: "Distressed",
};
const typeOptions = PROPERTY_TYPES.map((id) => ({ id, label: TYPE_LABELS[id] }));
const conditionOptions = PROPERTY_CONDITIONS.map((id) => ({ id, label: CONDITION_LABELS[id] }));
const USD = { style: "currency", currency: "USD", maximumFractionDigits: 0 } as const;

const OPTIONAL_TEXT = [
  "seller.email",
  "seller.phone",
  "property.neighborhood",
  "property.condition",
];
const OPTIONAL_NUMBERS = [
  "property.beds",
  "property.baths",
  "property.sqft",
  "property.lotSqft",
  "property.units",
  "property.yearBuilt",
  "property.repairEstimate",
];

/** Reads the form into the api's nested input. `empty` is what an emptied optional field becomes. */
function readForm(form: FormData, empty: undefined | null) {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const value = (name: string, asNumber: boolean) => {
    const raw = text(name);
    if (raw === "") return empty;
    return asNumber ? Number(raw) : raw;
  };
  const section = (prefix: string, required: string[]) => {
    const out: Record<string, unknown> = {};
    for (const name of required.filter((n) => n.startsWith(prefix)))
      out[name.slice(prefix.length)] = text(name);
    for (const name of OPTIONAL_TEXT.filter((n) => n.startsWith(prefix)))
      out[name.slice(prefix.length)] = value(name, false);
    for (const name of OPTIONAL_NUMBERS.filter((n) => n.startsWith(prefix)))
      out[name.slice(prefix.length)] = value(name, true);
    return out;
  };
  const required = [
    "seller.fullName",
    "property.streetLine",
    "property.zip",
    "property.propertyType",
  ];
  const price = (name: string) => (text(name) === "" ? empty : Number(text(name)));
  return {
    seller: section("seller.", required),
    property: section("property.", required),
    priceExpectationMin: price("priceExpectationMin"),
    priceExpectationMax: price("priceExpectationMax"),
  };
}

export function PackageForm({ existing }: { existing?: AgentPackageView }) {
  const { save, isSaving, fieldErrors, notice } = useSavePackage();
  const [propertyType, setPropertyType] = useState<string | null>(
    existing?.property.propertyType ?? null,
  );
  const p = existing?.property;
  const error = (name: string) => fieldErrors[name];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (existing) {
      // The api checks the values; the form only shapes them.
      const input = { ...readForm(form, null), version: existing.version };
      save({ mode: "update", id: existing.id, input: input as UpdateListingPackageInput });
    } else {
      save({ mode: "create", input: readForm(form, undefined) as CreateListingPackageInput });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-stack-lg" noValidate>
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "rounded-control border border-danger bg-danger-surface p-inset-md text-danger"
              : "rounded-control border border-default bg-card p-inset-md text-default"
          }
        >
          <p>{notice.message}</p>
          {notice.existingPackageId && (
            <Link
              href={`/agent/packages/${notice.existingPackageId}`}
              className="text-link underline"
            >
              Open the existing package
            </Link>
          )}
        </div>
      )}

      <fieldset className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card">
        <legend className="font-heading text-heading-sm">Seller</legend>
        <TextField
          name="seller.fullName"
          label="Full name"
          defaultValue={existing?.seller.fullName}
          errorMessage={error("seller.fullName")}
          isRequired
        />
        <TextField
          name="seller.email"
          type="email"
          label="Email"
          description="An email or a phone number is required."
          defaultValue={existing?.seller.email ?? undefined}
          errorMessage={error("seller.email")}
        />
        <TextField
          name="seller.phone"
          type="tel"
          label="Phone"
          description="International format, for example +15551234567."
          defaultValue={existing?.seller.phone ?? undefined}
          errorMessage={error("seller.phone")}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card">
        <legend className="font-heading text-heading-sm">Property</legend>
        <TextField
          name="property.streetLine"
          label="Street address"
          defaultValue={p?.streetLine}
          errorMessage={error("property.streetLine")}
          isRequired
        />
        <TextField
          name="property.zip"
          label="ZIP code"
          inputMode="numeric"
          defaultValue={p?.zip}
          errorMessage={error("property.zip")}
          isRequired
        />
        <TextField
          name="property.neighborhood"
          label="Neighborhood"
          defaultValue={p?.neighborhood ?? undefined}
          errorMessage={error("property.neighborhood")}
        />
        <Select
          name="property.propertyType"
          label="Property type"
          options={typeOptions}
          selectedKey={propertyType}
          onSelectionChange={(key) => setPropertyType(key === null ? null : String(key))}
          errorMessage={error("property.propertyType")}
          isRequired
        />
        <NumberField
          name="property.beds"
          label="Beds"
          minValue={0}
          defaultValue={p?.beds ?? undefined}
          errorMessage={error("property.beds")}
        />
        <NumberField
          name="property.baths"
          label="Baths"
          minValue={0}
          step={0.5}
          defaultValue={p?.baths ?? undefined}
          errorMessage={error("property.baths")}
        />
        <NumberField
          name="property.sqft"
          label="Square feet"
          minValue={0}
          defaultValue={p?.sqft ?? undefined}
          errorMessage={error("property.sqft")}
        />
        <NumberField
          name="property.lotSqft"
          label="Lot square feet"
          minValue={0}
          defaultValue={p?.lotSqft ?? undefined}
          errorMessage={error("property.lotSqft")}
        />
        {propertyType === "MULTI_FAMILY" && (
          <NumberField
            name="property.units"
            label="Units"
            minValue={0}
            defaultValue={p?.units ?? undefined}
            errorMessage={error("property.units")}
          />
        )}
        <NumberField
          name="property.yearBuilt"
          label="Year built"
          minValue={0}
          formatOptions={{ useGrouping: false }}
          defaultValue={p?.yearBuilt ?? undefined}
          errorMessage={error("property.yearBuilt")}
        />
        <Select
          name="property.condition"
          label="Condition"
          options={conditionOptions}
          defaultSelectedKey={p?.condition ?? undefined}
          errorMessage={error("property.condition")}
        />
        <NumberField
          name="property.repairEstimate"
          label="Repair estimate"
          minValue={0}
          formatOptions={USD}
          defaultValue={p?.repairEstimate ?? undefined}
          errorMessage={error("property.repairEstimate")}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card">
        <legend className="font-heading text-heading-sm">Price expectations</legend>
        <NumberField
          name="priceExpectationMin"
          label="Lowest price"
          minValue={0}
          formatOptions={USD}
          defaultValue={existing?.priceExpectationMin}
          errorMessage={error("priceExpectationMin")}
          isRequired
        />
        <NumberField
          name="priceExpectationMax"
          label="Highest price"
          minValue={0}
          formatOptions={USD}
          defaultValue={existing?.priceExpectationMax}
          errorMessage={error("priceExpectationMax")}
          isRequired
        />
      </fieldset>

      <div>
        <Button type="submit" isPending={isSaving}>
          {existing ? "Save changes" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
