// The button look (T327), shared by Button and by links that should read as buttons. A plain module,
// not a client component, so a Server Component can call buttonClasses for a Next.js Link.
import { FOCUS_RING } from "./styles.js";

export type ButtonVariant = "primary" | "secondary" | "cta" | "success";
export type ButtonSize = "md" | "sm";

export type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the width of the container, as in a card's footer or a form's submit. */
  fullWidth?: boolean;
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary text-on-primary data-hovered:bg-action-primary-hover hover:bg-action-primary-hover",
  secondary:
    "border border-default bg-card text-link data-hovered:bg-accent-subtle hover:bg-accent-subtle",
  cta: "bg-action-cta text-on-cta data-hovered:bg-action-cta-hover hover:bg-action-cta-hover",
  success:
    "bg-action-success text-on-primary data-hovered:bg-action-success-hover hover:bg-action-success-hover",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-control px-inset-lg text-button",
  sm: "min-h-touch px-inset-md text-button-sm",
};

/** The button look, for a Next.js Link or any element that should read as a button. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: ButtonLook = {}): string {
  return [
    FOCUS_RING,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
    "inline-flex cursor-pointer items-center justify-center gap-inline-sm rounded-control font-body transition-colors",
    "data-disabled:cursor-not-allowed data-disabled:border-0 data-disabled:bg-disabled data-disabled:text-disabled data-pending:opacity-75",
  ].join(" ");
}
