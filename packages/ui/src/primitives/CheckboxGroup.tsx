"use client";
// A labelled group of checkboxes (T301, T327) on React Aria's CheckboxGroup, which gives each box its
// keyboard and screen reader behavior and submits every checked value under the group's `name`.
// The "chips" variant shows each option as a pill that is outlined when checked, for short choice
// lists such as property types; it is still a checkbox to assistive technology.
import {
  Checkbox,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  Text,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
} from "react-aria-components";
import { FIELD_ERROR, FIELD_GROUP, FIELD_HINT, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type CheckboxOption = { id: string; label: string };

export type CheckboxGroupProps = Omit<
  AriaCheckboxGroupProps,
  "className" | "style" | "children" | "isInvalid"
> & {
  label: string;
  options: readonly CheckboxOption[];
  description?: string;
  errorMessage?: string;
  variant?: "list" | "chips";
};

const OPTION: Record<NonNullable<CheckboxGroupProps["variant"]>, string> = {
  list: "group flex min-h-touch cursor-pointer items-center gap-inline-md text-body-lg text-default",
  chips:
    "group inline-flex min-h-touch cursor-pointer items-center rounded-pill border border-default bg-card px-inset-md text-button-sm text-default data-selected:border-2 data-selected:border-selected data-selected:bg-accent-subtle data-selected:text-link data-hovered:bg-accent-subtle",
};

function Box() {
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-control border-2 border-strong bg-card text-caption text-on-primary group-data-selected:border-selected group-data-selected:bg-action-primary"
    >
      <span className="hidden group-data-selected:inline">✓</span>
    </span>
  );
}

export function CheckboxGroup({
  label,
  options,
  description,
  errorMessage,
  variant = "list",
  ...props
}: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      <div
        className={
          variant === "chips"
            ? "flex flex-wrap gap-inline-md"
            : "flex flex-wrap gap-x-inline-lg gap-y-stack-xs"
        }
      >
        {options.map((option) => (
          <Checkbox
            key={option.id}
            value={option.id}
            className={`${FOCUS_RING} ${OPTION[variant]}`}
          >
            {variant === "list" && <Box />}
            {option.label}
          </Checkbox>
        ))}
      </div>
      {description && (
        <Text slot="description" className={FIELD_HINT}>
          {description}
        </Text>
      )}
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaCheckboxGroup>
  );
}
