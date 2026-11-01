"use client";
// A button that opens a labelled panel beside it (T300), on React Aria's DialogTrigger and Popover:
// the button and panel are linked for screen readers, focus moves into the panel and back, and
// Escape or a click outside closes it. `children` may take `close` to close it from inside.
import type { ReactNode } from "react";
import { Dialog, DialogTrigger, Popover } from "react-aria-components";
import { Button } from "./Button.js";

export type PopoverPanelProps = {
  /** What the button says (it can include a count). */
  triggerLabel: string;
  /** The panel's accessible name. */
  panelLabel: string;
  children: ReactNode | ((close: () => void) => ReactNode);
};

export function PopoverPanel({ triggerLabel, panelLabel, children }: PopoverPanelProps) {
  return (
    <DialogTrigger>
      <Button variant="secondary" size="sm">
        {triggerLabel}
      </Button>
      <Popover
        placement="bottom end"
        className="w-screen max-w-sm rounded-card border border-default bg-card p-inset-lg shadow-card"
      >
        <Dialog aria-label={panelLabel} className="flex flex-col gap-stack-sm outline-none">
          {({ close }) => (typeof children === "function" ? children(close) : children)}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
