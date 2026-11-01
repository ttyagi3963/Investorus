"use client";
// A labelled text input (T268) on React Aria's TextField. `description` adds a hint and
// `errorMessage` marks the field invalid; both are linked to the input, so a screen reader reads
// them with the field. `rows` makes it a multi-line text area (T353).
import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { FIELD, FIELD_ERROR, FIELD_GROUP, FIELD_HINT, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type TextFieldProps = Omit<AriaTextFieldProps, "className" | "style" | "isInvalid"> & {
  label: string;
  description?: string;
  errorMessage?: string;
  /** Lines shown; given, the field is a text area. */
  rows?: number;
};

export function TextField({ label, description, errorMessage, rows, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      {rows ? (
        <TextArea rows={rows} className={`${FIELD} ${FOCUS_RING} py-inset-sm font-mono`} />
      ) : (
        <Input className={`${FIELD} ${FOCUS_RING}`} />
      )}
      {description && (
        <Text slot="description" className={FIELD_HINT}>
          {description}
        </Text>
      )}
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
