// The web fonts a brand can name (T327), loaded with next/font, which downloads them at build time
// and serves them from this app: no request to a font host at runtime, and no layout shift. A brand
// whose font is not here falls back to the rest of its font stack.
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-poppins",
});

const FONTS: Record<string, { variable: string; cssVariable: string }> = {
  Poppins: { variable: poppins.variable, cssVariable: "--font-poppins" },
};

/** The class that loads the brand's font, and its font stack with the loaded face first. */
export function brandFont(fontFamily: string[]): { className?: string; stack?: string } {
  const [first, ...rest] = fontFamily;
  const font = first === undefined ? undefined : FONTS[first];
  if (!font) return {};
  return { className: font.variable, stack: [`var(${font.cssVariable})`, ...rest].join(", ") };
}
