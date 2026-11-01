// The design system's button (T268, T327): React Aria's Button, which handles keyboard, touch, and
// screen readers. Variants: primary (the main action), secondary (white with a link-colored label),
// cta (the one highlighted action on a page, such as Compare offers or Submit offer), and success.
// `buttonClasses` gives a link the same look, for navigation that should read as a button.
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { FOCUS_RING } from "./styles.js";

export type ButtonVariant = "primary" | "secondary" | "cta" | "success";
export type ButtonSize = "md" | "sm";

export type ButtonProps = Omit<AriaButtonProps, "className" | "style"> & {
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
}: Pick<ButtonProps, "variant" | "size" | "fullWidth"> = {}): string {
  return [
    FOCUS_RING,
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? "w-full" : "",
    "inline-flex cursor-pointer items-center justify-center gap-inline-sm rounded-control font-body transition-colors",
    "data-disabled:cursor-not-allowed data-disabled:border-0 data-disabled:bg-disabled data-disabled:text-disabled data-pending:opacity-75",
  ].join(" ");
}

export function Button({ variant, size, fullWidth, ...props }: ButtonProps) {
  return <AriaButton {...props} className={buttonClasses({ variant, size, fullWidth })} />;
}
