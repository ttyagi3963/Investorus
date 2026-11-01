// A button that asks before a change that cannot be undone (T301), on React Aria's DialogTrigger
// and modal alert dialog: focus moves into the dialog, stays there, and returns to the button when
// it closes; Escape cancels.
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./Button.js";
import { MODAL_OVERLAY, MODAL_PANEL } from "./styles.js";

export type ConfirmDialogProps = {
  /** The button that opens the dialog. */
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  isDisabled?: boolean;
};

export function ConfirmDialog({
  triggerLabel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  isDisabled,
}: ConfirmDialogProps) {
  return (
    <DialogTrigger>
      <Button variant="secondary" isDisabled={isDisabled}>
        {triggerLabel}
      </Button>
      <ModalOverlay
        isDismissable
        className={MODAL_OVERLAY}
      >
        <Modal className={MODAL_PANEL}>
          <Dialog role="alertdialog" className="flex flex-col gap-stack-md outline-none">
            {({ close }) => (
              <>
                <Heading slot="title" className="font-heading text-heading-sm text-heading">
                  {title}
                </Heading>
                <p>{message}</p>
                {/* Cancel comes first, so the dialog's first focus lands on the safe choice. */}
                <div className="flex gap-inline-md">
                  <Button variant="secondary" onPress={close}>
                    {cancelLabel}
                  </Button>
                  <Button
                    onPress={() => {
                      close();
                      onConfirm();
                    }}
                  >
                    {confirmLabel}
                  </Button>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
