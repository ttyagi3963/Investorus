"use client";
// A labelled set of mutually exclusive choices (T342) on React Aria's RadioGroup, which gives arrow-key
// movement between options, one tab stop, and the label and each option's description to screen
// readers. Each option is a bordered row that is outlined when chosen, with an optional line of
// description under its label.
import {
  Label,
  Radio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps as AriaRadioGroupProps,
} from "react-aria-components";
import { FIELD_GROUP, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type RadioOption = { id: string; label: string; description?: string };

export type RadioGroupProps = Omit<AriaRadioGroupProps, "className" | "style" | "children"> & {
  label: string;
  /** Hide the group's label visually when the surrounding card already names it. */
  hideLabel?: boolean;
  options: readonly RadioOption[];
};

export function RadioGroup({ label, hideLabel = false, options, ...props }: RadioGroupProps) {
  return (
    <AriaRadioGroup {...props} className={FIELD_GROUP}>
      <Label className={hideLabel ? "sr-only" : FIELD_LABEL}>{label}</Label>
      <div className="flex flex-col gap-stack-sm">
        {options.map((option) => (
          <Radio
            key={option.id}
            value={option.id}
            className={`${FOCUS_RING} group flex cursor-pointer items-start gap-inline-md rounded-control border border-default p-inset-md data-disabled:cursor-not-allowed data-disabled:opacity-60 data-selected:border-selected data-selected:bg-accent-subtle`}
          >
            <span
              aria-hidden="true"
              className="mt-inset-xs flex size-5 shrink-0 items-center justify-center rounded-pill border-2 border-strong bg-card group-data-selected:border-selected"
            >
              <span className="hidden size-2.5 rounded-pill bg-action-primary group-data-selected:block" />
            </span>
            <span className="flex flex-col gap-stack-xs">
              <span className="text-label text-heading">{option.label}</span>
              {option.description && (
                <Text slot="description" className="text-helper text-muted">
                  {option.description}
                </Text>
              )}
            </span>
          </Radio>
        ))}
      </div>
    </AriaRadioGroup>
  );
}
