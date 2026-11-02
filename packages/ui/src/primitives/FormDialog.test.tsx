// Guards the form dialog's one rule (T385): a refused submit (a 400 or 409 from the api) leaves the
// dialog open with everything the user typed and says why, instead of closing and losing it.
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FormDialog } from "./FormDialog.js";
import { TextField } from "./TextField.js";

it("stays open with the typed values and the reason when the submit is refused", async () => {
  const onSubmit = vi.fn(() => Promise.reject(new Error("The offer changed. Reload it.")));
  render(
    <FormDialog
      triggerLabel="Counter"
      title="Counter the offer"
      submitLabel="Send"
      cancelLabel="Cancel"
      onSubmit={onSubmit}
    >
      <TextField name="terms" label="Terms" />
    </FormDialog>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Counter" }));
  fireEvent.change(screen.getByLabelText("Terms"), { target: { value: "Close by Friday" } });
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

  expect((await screen.findByRole("alert")).textContent).toBe("The offer changed. Reload it.");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect((screen.getByLabelText("Terms") as HTMLInputElement).value).toBe("Close by Friday");
});
