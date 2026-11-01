// A status pill (T327): the status's words on its tone's tinted background. The words carry the
// meaning, so the color is never the only cue (WCAG 1.4.1). Pass a tone from tokens/status-tones.ts.
import type { ReactNode } from "react";
import type { StatusTone } from "../tokens/status-tones.js";

const TONES: Record<StatusTone, string> = {
  draft: "bg-status-draft text-status-draft",
  open: "bg-status-open text-status-open",
  "offers-in": "bg-status-offers-in text-status-offers-in",
  "under-contract": "bg-status-under-contract text-status-under-contract",
  closed: "bg-status-closed text-status-closed",
  error: "bg-status-error text-status-error",
};

export type StatusChipProps = { tone: StatusTone; children: ReactNode };

export function StatusChip({ tone, children }: StatusChipProps) {
  return (
    <span
      className={`${TONES[tone]} inline-flex min-h-chip items-center whitespace-nowrap rounded-pill px-inset-md text-chip`}
    >
      {children}
    </span>
  );
}
