// A labelled single-choice list (T268) on React Aria's Select, which gives the keyboard, typeahead,
// and screen reader behavior of a native select with a styled popover.
import {
  Select as AriaSelect,
  Button,
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  SelectValue,
  type SelectProps as AriaSelectProps,
} from "react-aria-components";
import { FIELD, FIELD_ERROR, FIELD_GROUP, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type SelectOption = { id: string; label: string };

export type SelectProps = Omit<
  AriaSelectProps<SelectOption>,
  "className" | "style" | "children" | "isInvalid"
> & {
  label: string;
  options: readonly SelectOption[];
  errorMessage?: string;
};

export function Select({ label, options, errorMessage, ...props }: SelectProps) {
  return (
    <AriaSelect {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Button className={`${FIELD} ${FOCUS_RING} flex items-center justify-between text-left`}>
        <SelectValue />
        <span aria-hidden="true">▾</span>
      </Button>
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
      <Popover className="min-w-(--trigger-width) rounded-control border border-default bg-card shadow-card">
        <ListBox items={options} className="p-inset-sm outline-none">
          {(option) => (
            <ListBoxItem
              id={option.id}
              className="flex min-h-touch cursor-pointer items-center rounded-control px-inset-md text-body-lg text-default outline-none data-focused:bg-accent-subtle data-selected:font-semibold data-selected:text-link"
            >
              {option.label}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
