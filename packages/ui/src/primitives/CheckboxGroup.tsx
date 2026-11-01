// A labelled group of checkboxes (T301) on React Aria's CheckboxGroup, which gives each box its
// keyboard and screen reader behavior and submits every checked value under the group's `name`.
import {
  Checkbox,
  CheckboxGroup as AriaCheckboxGroup,
  FieldError,
  Label,
  Text,
  type CheckboxGroupProps as AriaCheckboxGroupProps,
} from "react-aria-components";
import { FIELD_ERROR, FIELD_GROUP, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type CheckboxOption = { id: string; label: string };

export type CheckboxGroupProps = Omit<
  AriaCheckboxGroupProps,
  "className" | "style" | "children" | "isInvalid"
> & {
  label: string;
  options: readonly CheckboxOption[];
  description?: string;
  errorMessage?: string;
};

export function CheckboxGroup({
  label,
  options,
  description,
  errorMessage,
  ...props
}: CheckboxGroupProps) {
  return (
    <AriaCheckboxGroup {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      {options.map((option) => (
        <Checkbox
          key={option.id}
          value={option.id}
          className={`${FOCUS_RING} group flex items-center gap-inline-sm text-body text-default`}
        >
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-control border border-strong bg-card group-data-selected:bg-action-primary group-data-selected:text-on-primary"
          >
            <span className="hidden group-data-selected:inline">✓</span>
          </span>
          {option.label}
        </Checkbox>
      ))}
      {description && (
        <Text slot="description" className="text-label text-muted">
          {description}
        </Text>
      )}
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaCheckboxGroup>
  );
}
