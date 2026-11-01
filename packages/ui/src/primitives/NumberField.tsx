// A labelled number input (T268) on React Aria's NumberField, which parses and formats the number
// for the user's locale (the screen passes `formatOptions`, for example whole US dollars).
import {
  NumberField as AriaNumberField,
  FieldError,
  Input,
  Label,
  type NumberFieldProps as AriaNumberFieldProps,
} from "react-aria-components";
import { FIELD, FIELD_ERROR, FIELD_GROUP, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type NumberFieldProps = Omit<AriaNumberFieldProps, "className" | "style" | "isInvalid"> & {
  label: string;
  errorMessage?: string;
};

export function NumberField({ label, errorMessage, ...props }: NumberFieldProps) {
  return (
    <AriaNumberField {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Input className={`${FIELD} ${FOCUS_RING}`} />
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaNumberField>
  );
}
