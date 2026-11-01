"use client";
// The buy box editor (T324; FR-060, XIX.3), one form for a new box and for editing one. Its
// criterion fields are generated from the registry's form metadata, so a new criterion appears here
// without a change to this file. Every criterion can be left as "any"; a list criterion set to
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
} from "@clever/contracts/buy-box";
import { Button, CheckboxGroup, Select, TextField } from "@clever/ui";
import type { FormEvent } from "react";
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

const forms = CRITERION_KEYS.map((key) => ({
  key,
  label: CRITERIA[key].label,
  form: (CRITERIA[key] as CriterionDefinition).form,
}));

const value = (box: BuyBoxView | undefined, field: string) => {
  const found = box?.[field as keyof BuyBoxView];
  return typeof found === "number" ? String(found) : undefined;
};

function CriterionFields({
  form,
  existing,
  error,
}: {
  form: CriterionForm;
  existing: BuyBoxView | undefined;
  error: (name: string) => string | undefined;
}) {
  switch (form.kind) {
    case "geography":
      return (
        <>
          <Select
            name="geographyMode"
            label="Where"
            options={geographyOptions}
            defaultSelectedKey={existing?.geographyMode ?? "NATIONWIDE"}
            errorMessage={error("geographyMode")}
          />
          <TextField
            name="geography"
            label="States or ZIP codes"
            description="Two-letter states (TX, AZ) or five-digit ZIP codes (78704), separated by commas. Leave empty for nationwide."
            defaultValue={existing?.geography.join(", ")}
            errorMessage={error("geography")}
          />
        </>
      );
    case "range":
      return (
        <div className="grid grid-cols-2 gap-inline-md">
          {(
            [
              [form.min, form.minLabel],
              [form.max, form.maxLabel],
            ] as const
          ).map(([name, label]) => (
            <TextField
              key={name}
              name={name}
              label={form.usd ? `${label} (USD)` : label}
              inputMode="decimal"
              description="Blank for any"
              defaultValue={value(existing, name)}
              errorMessage={error(name)}
            />
          ))}
        </div>
      );
    case "limit":
      return (
        <TextField
          name={form.field}
          label={form.usd ? `${form.label} (USD)` : form.label}
          inputMode="numeric"
          description="Blank for any"
          defaultValue={value(existing, form.field)}
          errorMessage={error(form.field)}
        />
      );
    case "choices": {
      const chosen = existing?.[form.field as keyof BuyBoxView] as string[] | null | undefined;
      const labels = OPTION_LABELS[form.field] ?? {};
      return (
        <>
          <Select
            name={`${form.field}.mode`}
            label="Accept"
            options={choiceModes}
            defaultSelectedKey={chosen ? ONLY : ANY}
          />
          <CheckboxGroup
            name={form.field}
            label="Only these"
            options={form.options.map((id) => ({ id, label: labels[id] ?? id }))}
            defaultValue={chosen ?? []}
            errorMessage={error(form.field)}
          />
        </>
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

export function BuyBoxForm({ existing }: { existing?: BuyBoxView }) {
  const { submit, isPending, fieldErrors, error, saved } = useBuyBoxForm(existing);
  const fieldError = (name: string) => fieldErrors[name];

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(readForm(new FormData(event.currentTarget), existing?.status ?? "ACTIVE"));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-stack-lg" noValidate>
      <p className="rounded-control border border-default bg-card p-inset-md">
        Changes apply to new listings and to listings still taking offers. Listings already shared
        with you stay visible.
      </p>
      {error && <ErrorNotice error={error} />}
      {saved && (
        <p role="status" className="rounded-control border border-default bg-card p-inset-md">
          Saved. Listings still taking offers are being checked against it.
        </p>
      )}

      <fieldset className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card">
        <legend className="font-heading text-heading-sm">Name</legend>
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
      </fieldset>

      {forms.map(({ key, label, form }) => (
        <fieldset
          key={key}
          className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
        >
          <legend className="font-heading text-heading-sm">{label}</legend>
          <CriterionFields form={form} existing={existing} error={fieldError} />
        </fieldset>
      ))}

      <div>
        <Button type="submit" isPending={isPending}>
          {existing ? "Save changes" : "Create buy box"}
        </Button>
      </div>
    </form>
  );
}
