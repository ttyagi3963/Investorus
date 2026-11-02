"use client";
// A button that opens a small form in a modal dialog (T315), on React Aria's DialogTrigger: focus
// moves into the dialog and returns to the button when it closes, Escape cancels, and the form's
// own required fields block an empty submit. Used where a choice needs a few words or terms first.
// The dialog closes only once the submit succeeds; a refusal keeps what was typed and says why (T385).
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { ButtonVariant } from "./button-classes.js";
import { Button } from "./Button.js";
import { MODAL_OVERLAY, MODAL_PANEL } from "./styles.js";

export type FormDialogProps = {
  /** The button that opens the dialog. */
  triggerLabel: string;
  title: string;
  submitLabel: string;
  cancelLabel: string;
  /**
   * Called with the form's values. Given a promise, the dialog waits for it: it closes when the
   * promise resolves, and stays open showing the error's message when it rejects.
   */
  onSubmit: (values: FormData) => void | Promise<unknown>;
  /** The form's fields, each named so `onSubmit` can read it. */
  children: ReactNode;
  isDisabled?: boolean;
  triggerVariant?: ButtonVariant;
};

/** The form inside the open dialog: mounted on each opening, so a failure from last time is gone. */
function DialogForm({
  title,
  submitLabel,
  cancelLabel,
  onSubmit,
  children,
  close,
}: Omit<FormDialogProps, "triggerLabel" | "isDisabled" | "triggerVariant"> & {
  close: () => void;
}) {
  const [isPending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setPending(true);
    try {
      await onSubmit(new FormData(event.currentTarget));
      close();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-stack-md" onSubmit={(event) => void submit(event)}>
      <Heading slot="title" className="font-heading text-heading-sm text-heading">
        {title}
      </Heading>
      {children}
      {failure && (
        <p
          role="alert"
          className="rounded-control border border-danger bg-status-error p-inset-md text-body text-status-error"
        >
          {failure}
        </p>
      )}
      <div className="flex gap-inline-md">
        <Button variant="secondary" onPress={close}>
          {cancelLabel}
        </Button>
        <Button type="submit" isPending={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function FormDialog({
  triggerLabel,
  isDisabled,
  triggerVariant = "secondary",
  ...form
}: FormDialogProps) {
  return (
    <DialogTrigger>
      <Button variant={triggerVariant} isDisabled={isDisabled}>
        {triggerLabel}
      </Button>
      <ModalOverlay isDismissable className={MODAL_OVERLAY}>
        <Modal className={MODAL_PANEL}>
          <Dialog className="outline-none">
            {({ close }) => <DialogForm {...form} close={close} />}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
