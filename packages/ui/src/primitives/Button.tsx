// The design system's button (T268): React Aria's Button, which handles keyboard, touch, and screen
// readers, styled as the primary or secondary action with a visible focus ring.
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { FOCUS_RING } from "./styles.js";

export type ButtonProps = Omit<AriaButtonProps, "className" | "style"> & {
  variant?: "primary" | "secondary";
};

const VARIANTS = {
  primary: "bg-action-primary text-on-primary data-hovered:bg-action-primary-hover",
  secondary: "bg-action-secondary text-on-secondary",
} as const;

export function Button({ variant = "primary", ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={`${FOCUS_RING} ${VARIANTS[variant]} rounded-control px-inset-md py-inset-sm text-label font-body data-disabled:opacity-50 data-pending:opacity-75`}
    />
  );
}
