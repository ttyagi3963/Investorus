"use client";
// The buy box editor (T324, T331; FR-060, XIX.3), one form for a new box and for editing one, in a
// card with the criteria under four headings. Its criterion fields are generated from the
// registry's form metadata; SECTION_OF is a record over the registry's keys, so a new criterion
// fails the build until it is given a heading. Every criterion can be left as "any"; a list set to
// "only these" with nothing checked is sent as an empty list, which the api refuses with a reason.
// Each input is named after its api field, so an api error shows on its field.
import {
  BUY_BOX_STRATEGIES,
  CRITERIA,
  CRITERION_KEYS,
  GEOGRAPHY_MODES,
  type BuyBoxView,
  type CriterionDefinition,
  type CriterionForm,
  type CriterionKey,
} from "@clever/contracts/buy-box";
import { Button, Card, CheckboxGroup, Select, TextField } from "@clever/ui";
import { useId, type FormEvent } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import {
  CONDITION_LABELS,
  PROGRAM_LABELS,
  PROPERTY_TYPE_LABELS,
} from "@/features/listing-package/labels";
import { STRATEGY_LABELS } from "./labels";
import { ANY, LISTED, NO_STRATEGY, ONLY, readForm } from "./read-form";
import { useBuyBoxForm } from "./useBuyBoxForm";

const OPTION_LABELS: Record<string, Record<string, string>> = {
  propertyTypes: PROPERTY_TYPE_LABELS,
  conditionsAccepted: CONDITION_LABELS,
  programsAccepted: PROGRAM_LABELS,
};
const GEOGRAPHY_LABELS: Record<(typeof GEOGRAPHY_MODES)[number], string> = {
  NATIONWIDE: "Nationwide",
  STATES: "Only certain states",
  ZIPS: "Only certain ZIP codes",
};
const strategyOptions = [
  { id: NO_STRATEGY, label: "No label" },
  ...BUY_BOX_STRATEGIES.map((id) => ({ id, label: STRATEGY_LABELS[id] })),
];
const geographyOptions = GEOGRAPHY_MODES.map((id) => ({ id, label: GEOGRAPHY_LABELS[id] }));
const choiceModes = [
  { id: ANY, label: "Any" },
  { id: ONLY, label: "Only the ones checked" },
];

const SECTIONS = ["Where you buy", "Price", "Property", "Deal terms"] as const;
type Section = (typeof SECTIONS)[number];

/** The heading each criterion is shown under. */
const SECTION_OF: Record<CriterionKey, Section> = {
  geography: "Where you buy",
  price: "Price",
  propertyType: "Property",
  yearBuilt: "Property",
  beds: "Property",
  baths: "Property",
  sqft: "Property",
  units: "Property",
  condition: "Property",
  repair: "Deal terms",
  closingSpeed: "Deal terms",
  listedStatus: "Deal terms",
  programs: "Deal terms",
};

type Entry = { key: CriterionKey; label: string; form: CriterionForm };
type ErrorOf = (name: string) => string | undefined;

const entries: Entry[] = CRITERION_KEYS.map((key) => ({
  key,
  label: CRITERIA[key].label,
  form: (CRITERIA[key] as CriterionDefinition).form,
}));
const isNumeric = ({ form }: Entry) => form.kind === "range" || form.kind === "limit";

/** A section's criteria in registry order, with neighbouring number fields gathered into one row. */
function inRows(section: Section): Entry[][] {
  const rows: Entry[][] = [];
  for (const entry of entries.filter(({ key }) => SECTION_OF[key] === section)) {
    const last = rows.at(-1);
    if (last && isNumeric(entry) && last.every(isNumeric)) last.push(entry);
    else rows.push([entry]);
  }
  return rows;
}

const value = (box: BuyBoxView | undefined, field: string) => {
  const found = box?.[field as keyof BuyBoxView];
  return typeof found === "number" ? String(found) : undefined;
};

/** A min and a max side by side, with "to" between them on the inputs' line. */
function RangeFields({
  form,
  existing,
  error,
}: {
  form: Extract<CriterionForm, { kind: "range" }>;
  existing: BuyBoxView | undefined;
  error: ErrorOf;
}) {
  const field = (name: string, label: string) => (
    <div className="min-w-0 flex-1">
      <TextField
        name={name}
        label={form.usd ? `${label} (USD)` : label}
        inputMode="decimal"
        defaultValue={value(existing, name)}
        errorMessage={error(name)}
      />
    </div>
  );
  return (
    <div className="flex items-start gap-inline-sm">
      {field(form.min, form.minLabel)}
      {/* An invisible label line above "to", so it sits level with the inputs. */}
      <span aria-hidden="true" className="flex flex-col gap-stack-sm">
        <span className="invisible text-label">to</span>
        <span className="flex min-h-control items-center text-body text-muted">to</span>
      </span>
      {field(form.max, form.maxLabel)}
    </div>
  );
}

function CriterionFields({
  entry: { label, form },
  existing,
  error,
}: {
  entry: Entry;
  existing: BuyBoxView | undefined;
  error: ErrorOf;
}) {
  switch (form.kind) {
    case "geography":
      return (
        <div className="grid grid-cols-1 gap-x-inline-lg gap-y-stack-md md:grid-cols-3">
          <Select
            name="geographyMode"
            label="Where"
            options={geographyOptions}
            defaultSelectedKey={existing?.geographyMode ?? "NATIONWIDE"}
            errorMessage={error("geographyMode")}
          />
          <div className="md:col-span-2">
            <TextField
              name="geography"
              label="States or ZIP codes"
              description="Two-letter states (TX, AZ) or five-digit ZIP codes (78704), separated by commas. Leave empty for nationwide."
              defaultValue={existing?.geography.join(", ")}
              errorMessage={error("geography")}
            />
          </div>
        </div>
      );
    case "range":
      return <RangeFields form={form} existing={existing} error={error} />;
    case "limit":
      return (
        <TextField
          name={form.field}
          label={form.usd ? `${form.label} (USD)` : form.label}
          inputMode="numeric"
          defaultValue={value(existing, form.field)}
          errorMessage={error(form.field)}
        />
      );
    case "choices": {
      const chosen = existing?.[form.field as keyof BuyBoxView] as string[] | null | undefined;
      const labels = OPTION_LABELS[form.field] ?? {};
      return (
        <fieldset className="flex flex-col gap-stack-sm">
          <legend className="pb-inset-sm text-body-lg font-semibold text-heading">{label}</legend>
          <div className="grid grid-cols-1 gap-x-inline-lg gap-y-stack-md md:grid-cols-3">
            <Select
              name={`${form.field}.mode`}
              label="Accept"
              options={choiceModes}
              defaultSelectedKey={chosen ? ONLY : ANY}
            />
            <div className="md:col-span-2">
              <CheckboxGroup
                name={form.field}
                label="Only these"
                variant="chips"
                options={form.options.map((id) => ({ id, label: labels[id] ?? id }))}
                defaultValue={chosen ?? []}
                errorMessage={error(form.field)}
              />
            </div>
          </div>
        </fieldset>
      );
    }
    case "toggle":
      return (
        <CheckboxGroup
          name={form.field}
          label="Listed homes"
          options={[{ id: LISTED, label: form.label }]}
          defaultValue={existing?.acceptsListed === false ? [] : [LISTED]}
          errorMessage={error(form.field)}
        />
      );
  }
}

/** One heading and its criteria; number fields that sit together share a two-column grid. */
function CriteriaSection({
  title,
  existing,
  error,
}: {
  title: Section;
  existing: BuyBoxView | undefined;
  error: ErrorOf;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-md">
      <h2 id={headingId} className="font-heading text-heading-sm text-heading">
        {title}
      </h2>
      {inRows(title).map((row) =>
        row.length > 1 ? (
          <div
            key={row[0]?.key}
            className="grid grid-cols-1 gap-x-inline-lg gap-y-stack-md lg:grid-cols-2"
          >
            {row.map((entry) => (
              <CriterionFields key={entry.key} entry={entry} existing={existing} error={error} />
            ))}
          </div>
        ) : (
          row.map((entry) => (
            <CriterionFields key={entry.key} entry={entry} existing={existing} error={error} />
          ))
        ),
      )}
    </section>
  );
}

export function BuyBoxForm({ existing }: { existing?: BuyBoxView }) {
  const { submit, isPending, fieldErrors, error, saved } = useBuyBoxForm(existing);
  const fieldError = (name: string) => fieldErrors[name];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(readForm(new FormData(event.currentTarget), existing?.status ?? "ACTIVE"));
  }

  return (
    <Card padding="xl">
      <form onSubmit={onSubmit} className="flex flex-col gap-stack-xl" noValidate>
        <div className="flex flex-col gap-stack-md">
          <div className="grid grid-cols-1 gap-x-inline-lg gap-y-stack-md md:grid-cols-2">
            <TextField
              name="name"
              label="Name"
              defaultValue={existing?.name}
              errorMessage={fieldError("name")}
              isRequired
            />
            <Select
              name="strategy"
              label="Strategy label"
              options={strategyOptions}
              defaultSelectedKey={existing?.strategy ?? NO_STRATEGY}
              errorMessage={fieldError("strategy")}
            />
          </div>
          <p className="text-helper text-muted">
            Leave a number blank, or a list at Any, to accept every home on that point.
          </p>
        </div>

        {SECTIONS.map((title) => (
          <CriteriaSection key={title} title={title} existing={existing} error={fieldError} />
        ))}

        {error && <ErrorNotice error={error} />}
        {saved && (
          <p
            role="status"
            className="rounded-control bg-status-under-contract p-inset-md text-body text-status-under-contract"
          >
            Saved. Listings still taking offers are being checked against it.
          </p>
        )}
        <div className="flex flex-col gap-stack-md border-t border-subtle pt-inset-lg sm:flex-row sm:items-center sm:justify-between">
          <p className="text-helper text-muted">
            {existing && `Version ${existing.version} · `}Changes apply to new listings and to
            listings still taking offers. Listings already shared with you stay visible.
          </p>
          <div className="shrink-0">
            <Button type="submit" isPending={isPending}>
              {existing ? "Save changes" : "Create buy box"}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
