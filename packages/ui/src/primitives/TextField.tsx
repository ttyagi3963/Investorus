// A labelled text input (T268) on React Aria's TextField. `description` adds a hint and
// `errorMessage` marks the field invalid; both are linked to the input, so a screen reader reads
// them with the field.
import {
  TextField as AriaTextField,
  FieldError,
  Input,
  Label,
  Text,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { FIELD, FIELD_ERROR, FIELD_GROUP, FIELD_HINT, FIELD_LABEL, FOCUS_RING } from "./styles.js";

export type TextFieldProps = Omit<AriaTextFieldProps, "className" | "style" | "isInvalid"> & {
  label: string;
  description?: string;
  errorMessage?: string;
};

export function TextField({ label, description, errorMessage, ...props }: TextFieldProps) {
  return (
    <AriaTextField {...props} isInvalid={Boolean(errorMessage)} className={FIELD_GROUP}>
      <Label className={FIELD_LABEL}>{label}</Label>
      <Input className={`${FIELD} ${FOCUS_RING}`} />
      {description && (
        <Text slot="description" className={FIELD_HINT}>
          {description}
        </Text>
      )}
      <FieldError className={FIELD_ERROR}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
