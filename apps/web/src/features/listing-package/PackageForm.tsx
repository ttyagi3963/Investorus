"use client";
// The package form (T270, T301, T330), one form for a new draft and for editing one: seller,
// property, price, and the publish fields (closing window, listed, programs), each group a card
// with its fields in a grid. Each input is named, and has
// the id of, its api field path, so an api error shows on its field and a publish blocker links to
// it. On edit, an emptied optional field is sent as null (cleared); on create it is left out.
import type {
  AgentPackageView,
  CreateListingPackageInput,
  UpdateListingPackageInput,
} from "@clever/contracts/listing-package";
import { OFFER_PROGRAMS } from "@clever/contracts/listing-package";
import { PROPERTY_CONDITIONS, PROPERTY_TYPES } from "@clever/contracts/property";
import { Button, Card, CheckboxGroup, NumberField, Select, TextField } from "@clever/ui";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { CONDITION_LABELS, PROGRAM_LABELS, PROPERTY_TYPE_LABELS } from "./labels";
import { useSavePackage } from "./useSavePackage";

const typeOptions = PROPERTY_TYPES.map((id) => ({ id, label: PROPERTY_TYPE_LABELS[id] }));
const conditionOptions = PROPERTY_CONDITIONS.map((id) => ({ id, label: CONDITION_LABELS[id] }));
const programOptions = OFFER_PROGRAMS.map((id) => ({ id, label: PROGRAM_LABELS[id] }));
const listedOptions = [
  { id: "no", label: "No" },
  { id: "yes", label: "Yes" },
];
const GRID_2 = "grid gap-x-inline-lg gap-y-stack-md md:grid-cols-2";
const GRID_3 = "grid gap-x-inline-lg gap-y-stack-md md:grid-cols-3";
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
  const listed = text("currentlyListed");
  const programs = form.getAll("eligiblePrograms").map(String);
  return {
    seller: section("seller.", required),
    property: section("property.", required),
    priceExpectationMin: price("priceExpectationMin"),
    priceExpectationMax: price("priceExpectationMax"),
    closingWindowStart: value("closingWindowStart", false),
    closingWindowEnd: value("closingWindowEnd", false),
    currentlyListed: listed === "" ? empty : listed === "yes",
    // On edit, no box checked clears the programs; on create it is left out.
    eligiblePrograms: programs.length > 0 ? programs : empty === null ? [] : undefined,
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
      {notice?.tone === "error" && (
        <ErrorNotice error={notice}>
          {notice.existingPackageId && (
            <Link
              href={`/agent/packages/${notice.existingPackageId}`}
              className="text-link underline"
            >
              Open the existing package
            </Link>
          )}
        </ErrorNotice>
      )}
      {notice?.tone === "saved" && (
        <p
          role="status"
          className="rounded-control border border-default bg-card p-inset-md text-default"
        >
          {notice.message}
        </p>
      )}

      <Card title="Seller" description="Investors never see the seller's name or contact details.">
        <div className={GRID_2}>
          <div className="md:col-span-2">
            <TextField
              name="seller.fullName"
              label="Full name"
              defaultValue={existing?.seller.fullName}
              errorMessage={error("seller.fullName")}
              isRequired
            />
          </div>
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
        </div>
      </Card>

      <Card title="Property" description="Investors match on these details.">
        <div className={GRID_3}>
          <div className="md:col-span-2">
            <TextField
              id="property.streetLine"
              name="property.streetLine"
              label="Street address"
              defaultValue={p?.streetLine}
              errorMessage={error("property.streetLine")}
              isRequired
            />
          </div>
          <TextField
            id="property.zip"
            name="property.zip"
            label="ZIP code"
            inputMode="numeric"
            defaultValue={p?.zip}
            errorMessage={error("property.zip")}
            isRequired
          />
          <TextField
            id="property.neighborhood"
            name="property.neighborhood"
            label="Neighborhood"
            defaultValue={p?.neighborhood ?? undefined}
            errorMessage={error("property.neighborhood")}
          />
          <Select
            id="property.propertyType"
            name="property.propertyType"
            label="Property type"
            options={typeOptions}
            selectedKey={propertyType}
            onSelectionChange={(key) => setPropertyType(key === null ? null : String(key))}
            errorMessage={error("property.propertyType")}
            isRequired
          />
          <NumberField
            id="property.beds"
            name="property.beds"
            label="Beds"
            minValue={0}
            defaultValue={p?.beds ?? undefined}
            errorMessage={error("property.beds")}
          />
          <NumberField
            id="property.baths"
            name="property.baths"
            label="Baths"
            minValue={0}
            step={0.5}
            defaultValue={p?.baths ?? undefined}
            errorMessage={error("property.baths")}
          />
          <NumberField
            id="property.sqft"
            name="property.sqft"
            label="Square feet"
            minValue={0}
            defaultValue={p?.sqft ?? undefined}
            errorMessage={error("property.sqft")}
          />
          <NumberField
            id="property.lotSqft"
            name="property.lotSqft"
            label="Lot square feet"
            minValue={0}
            defaultValue={p?.lotSqft ?? undefined}
            errorMessage={error("property.lotSqft")}
          />
          {propertyType === "MULTI_FAMILY" && (
            <NumberField
              id="property.units"
              name="property.units"
              label="Units"
              minValue={0}
              defaultValue={p?.units ?? undefined}
              errorMessage={error("property.units")}
            />
          )}
          <NumberField
            id="property.yearBuilt"
            name="property.yearBuilt"
            label="Year built"
            minValue={0}
            formatOptions={{ useGrouping: false }}
            defaultValue={p?.yearBuilt ?? undefined}
            errorMessage={error("property.yearBuilt")}
          />
          <Select
            id="property.condition"
            name="property.condition"
            label="Condition"
            options={conditionOptions}
            defaultSelectedKey={p?.condition ?? undefined}
            errorMessage={error("property.condition")}
          />
          <NumberField
            id="property.repairEstimate"
            name="property.repairEstimate"
            label="Repair estimate"
            minValue={0}
            formatOptions={USD}
            defaultValue={p?.repairEstimate ?? undefined}
            errorMessage={error("property.repairEstimate")}
          />
        </div>
      </Card>

      <Card title="Price expectations">
        <div className={GRID_2}>
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
        </div>
      </Card>

      <Card
        title="Publishing"
        description="Investors need these before the package can be published."
      >
        <div className={GRID_2}>
          <TextField
            id="closingWindowStart"
            name="closingWindowStart"
            type="date"
            label="Closing window starts"
            defaultValue={existing?.closingWindowStart ?? undefined}
            errorMessage={error("closingWindowStart")}
          />
          <TextField
            id="closingWindowEnd"
            name="closingWindowEnd"
            type="date"
            label="Closing window ends"
            defaultValue={existing?.closingWindowEnd ?? undefined}
            errorMessage={error("closingWindowEnd")}
          />
          <Select
            id="currentlyListed"
            name="currentlyListed"
            label="Is the home listed for sale now?"
            options={listedOptions}
            defaultSelectedKey={
              existing?.currentlyListed == null
                ? undefined
                : existing.currentlyListed
                  ? "yes"
                  : "no"
            }
            errorMessage={error("currentlyListed")}
          />
          <div className="md:col-span-2">
            <CheckboxGroup
              id="eligiblePrograms"
              name="eligiblePrograms"
              label="Offer programs the seller will consider"
              options={programOptions}
              defaultValue={existing?.eligiblePrograms}
              errorMessage={error("eligiblePrograms")}
              variant="chips"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" isPending={isSaving}>
          {existing ? "Save changes" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
