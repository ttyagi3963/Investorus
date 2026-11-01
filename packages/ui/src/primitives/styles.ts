// Class lists the primitives share (T268, T327), so every control has the same visible focus ring and
// the same field look: a 48px field with a 4px radius, a semibold label, and a red 2px border when
// invalid. Semantic utilities only; the values come from the brand through styles/theme.css.
/** React Aria sets data-focus-visible; plain links and native controls use :focus-visible. */
export const FOCUS_RING =
  "outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const FIELD =
  "min-h-control w-full rounded-control border border-strong bg-card px-inset-md text-body-lg text-default placeholder:text-placeholder data-invalid:border-2 data-invalid:border-danger data-disabled:bg-disabled data-disabled:text-disabled";

export const FIELD_GROUP = "flex flex-col gap-stack-sm";
export const FIELD_LABEL = "text-label text-default";
export const FIELD_HINT = "text-helper text-muted";
export const FIELD_ERROR = "text-helper font-medium text-danger";

/** The modal backdrop and panel every dialog uses. */
export const MODAL_OVERLAY =
  "fixed inset-0 z-10 flex items-center justify-center bg-overlay p-inset-lg";
export const MODAL_PANEL = "w-full max-w-md rounded-card bg-card p-inset-xl shadow-card";
