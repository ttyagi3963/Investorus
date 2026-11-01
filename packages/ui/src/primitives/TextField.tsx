// A labelled text input (T268) on React Aria's TextField. `errorMessage` marks the field invalid and
// shows the message under it, linked to the input so a screen reader reads it with the field.
import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { FIELD, FIELD_ERROR, FIELD_GROUP, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type TextFieldProps = Omit<AriaTextFieldProps, "className" | "style" | "isInvalid"> & {
  label: string;
  errorMessage?: string;
};

export function TextField({ label, errorMessage, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Input className={`${FIELD} ${FOCUS_RING}`} />
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
