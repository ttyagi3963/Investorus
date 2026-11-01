"use client";
// Asks for a new offer deadline (T316): extending the round, reopening it, or reopening after a
// deal fell through. The field starts three days out; the api checks it is ahead and within 30 days.
import { FormDialog, TextField } from "@clever/ui";
import { toLocalInput } from "@/lib/local-time";

export function DeadlineDialog({
  label,
  title,
  note,
  onSubmit,
  isDisabled,
  triggerVariant,
}: {
  label: string;
  title: string;
  note: string;
  onSubmit: (offerDeadline: string) => void;
  isDisabled: boolean;
  triggerVariant?: "primary" | "secondary";
}) {
  return (
    <FormDialog
      triggerLabel={label}
      title={title}
      submitLabel={label}
      cancelLabel="Cancel"
      isDisabled={isDisabled}
      triggerVariant={triggerVariant}
      onSubmit={(values) => onSubmit(new Date(String(values.get("offerDeadline"))).toISOString())}
    >
      <p>{note}</p>
      <TextField
        name="offerDeadline"
        type="datetime-local"
        label="New offer deadline"
        defaultValue={toLocalInput(new Date(Date.now() + 72 * 3_600_000).toISOString())}
        isRequired
      />
    </FormDialog>
  );
}
