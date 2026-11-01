"use client";
// A button that opens a small form in a modal dialog (T315), on React Aria's DialogTrigger: focus
// moves into the dialog and returns to the button when it closes, Escape cancels, and the form's
// own required fields block an empty submit. Used where a choice needs a few words or terms first.
import type { FormEvent, ReactNode } from "react";
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
  /** Called with the form's values; the dialog closes after it. */
  onSubmit: (values: FormData) => void;
  /** The form's fields, each named so `onSubmit` can read it. */
  children: ReactNode;
  isDisabled?: boolean;
  triggerVariant?: ButtonVariant;
};

export function FormDialog({
  triggerLabel,
  title,
  submitLabel,
  cancelLabel,
  onSubmit,
  children,
  isDisabled,
  triggerVariant = "secondary",
}: FormDialogProps) {
  return (
    <DialogTrigger>
      <Button variant={triggerVariant} isDisabled={isDisabled}>
        {triggerLabel}
      </Button>
      <ModalOverlay
        isDismissable
        className={MODAL_OVERLAY}
      >
        <Modal className={MODAL_PANEL}>
          <Dialog className="outline-none">
            {({ close }) => (
              <form
                className="flex flex-col gap-stack-md"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  close();
                  onSubmit(values);
                }}
              >
                <Heading slot="title" className="font-heading text-heading-sm text-heading">
                  {title}
                </Heading>
                {children}
                <div className="flex gap-inline-md">
                  <Button variant="secondary" onPress={close}>
                    {cancelLabel}
                  </Button>
                  <Button type="submit">{submitLabel}</Button>
                </div>
              </form>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
