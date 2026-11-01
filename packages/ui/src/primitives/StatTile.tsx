// A labelled figure (T327), such as "Offers received 4" or an import's "Rejected 9", on a soft or
// status-tinted tile. A description list pairs the label with its value for screen readers.
import type { ReactNode } from "react";
import type { StatusTone } from "../tokens/status-tones.js";

const SURFACES: Record<StatusTone | "neutral", string> = {
  neutral: "bg-soft",
  draft: "bg-status-draft",
  open: "bg-status-open",
  "offers-in": "bg-status-offers-in",
  "under-contract": "bg-status-under-contract",
  closed: "bg-status-closed",
  error: "bg-status-error",
};

export type StatTileProps = {
  label: string;
  value: ReactNode;
  tone?: StatusTone | "neutral";
};

export function StatTile({ label, value, tone = "neutral" }: StatTileProps) {
  return (
    <dl className={`${SURFACES[tone]} flex flex-col gap-stack-xs rounded-control p-inset-md`}>
      <dt className="text-helper text-muted">{label}</dt>
      <dd className="font-heading text-heading-md text-heading">{value}</dd>
    </dl>
  );
}
