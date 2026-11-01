"use client";
// The design system's button (T268, T327): React Aria's Button, which handles keyboard, touch, and
// screen readers. Variants: primary (the main action), secondary (white with a link-colored label),
// cta (the one highlighted action on a page, such as Compare offers or Submit offer), and success.
// `buttonClasses` gives a link the same look, for navigation that should read as a button.
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { buttonClasses, type ButtonLook } from "./button-classes.js";

export type ButtonProps = Omit<AriaButtonProps, "className" | "style"> & ButtonLook;

export function Button({ variant, size, fullWidth, ...props }: ButtonProps) {
  return <AriaButton {...props} className={buttonClasses({ variant, size, fullWidth })} />;
}
