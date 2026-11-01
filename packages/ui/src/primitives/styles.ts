// Class lists the primitives share (T268), so every control has the same visible focus ring and the
// same field look. Semantic utilities only; the values come from styles/theme.css.
export const FOCUS_RING =
  "outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus";

export const FIELD =
  "rounded-control border border-strong bg-card px-inset-sm py-inset-sm text-body text-default data-invalid:border-danger";

export const FIELD_GROUP = "flex flex-col gap-stack-sm";
export const FIELD_LABEL = "text-label text-default";
export const FIELD_ERROR = "text-label text-danger";
