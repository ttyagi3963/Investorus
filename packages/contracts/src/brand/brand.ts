// A brand's data and its checks (T347; FR-091, FR-092, FR-095, contracts/design-tokens.md): the content
// schema (name, product names, logo, sign-in copy), the theme the api serves, and the validator that
// refuses a token set the screens cannot use: an unsafe, dangling, or circular token, a variable the
// theme reads but the set lacks, a text and background pair under WCAG AA's 4.5:1, or an input
// border or focus ring under the 3:1 a control's outline needs (T385). Each failure is named, so
// operations can fix the file (SC-015).
import { z } from "zod";
import { REQUIRED_BRAND_VARIABLES } from "./required.js";
import { toCssVariables } from "./tokens.js";

export const brandContentSchema = z.object({
  brandId: z.string().min(1),
  displayName: z.string().min(1),
  productName: z.string().min(1),
  opsProductName: z.string().min(1),
  /** A path on this site: `//host/...` or `/\host/...` would load the logo from another site. */
  logoPath: z.string().regex(/^\/(?![/\\])[^\\]*$/),
  signIn: z.object({
    headline: z.string().min(1),
    intro: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
  }),
});
export type BrandContent = z.infer<typeof brandContentSchema>;

/** A brand in the switcher: its ID, its name, and the addresses that open it. */
export type BrandSummary = { brandId: string; displayName: string; hosts: string[] };

/** What the web app needs to render a brand (GET /brands/:id/theme). */
export type BrandThemeView = {
  brandId: string;
  tokenVersion: number;
  /** --brand-* custom properties for styles/theme.css. */
  cssVariables: Record<string, string>;
  /** The base font stack, the brand's own font first. */
  fontFamily: string[];
  content: BrandContent;
};

/** A brand's token file as operations edit it (GET /ops/brands/:id/tokens). */
export type BrandTokensView = { brandId: string; tokenVersion: number; tokens: unknown };

/** One reason a token set was refused, with the token or variable it concerns. */
export type BrandProblem = { field: string; message: string };

/** The text and background pairs the screens put together; each must reach 4.5:1 (WCAG AA). */
export const TEXT_ON_BACKGROUND: readonly (readonly [text: string, background: string])[] = [
  ["text-primary", "background-surface"],
  ["text-primary", "background-subtle"],
  ["text-heading", "background-surface"],
  ["text-heading", "background-subtle"],
  ["text-muted", "background-surface"],
  ["text-muted", "background-subtle"],
  ["text-link", "background-surface"],
  ["text-link", "background-subtle"],
  ["text-error", "background-surface"],
  ["text-on-action", "action-primary"],
  ["text-on-action", "action-primary-hover"],
  ["text-on-action", "action-success"],
  ["text-on-cta", "action-cta"],
  ["text-inverse", "background-header-ops"],
  ["text-inverse-muted", "background-header-ops"],
  ...["draft", "open", "offers-in", "under-contract", "closed", "error"].map(
    (status) => [`status-${status}-text`, `status-${status}-background`] as const,
  ),
];

/**
 * The control outlines (WCAG 2.1 SC 1.4.11, 3:1): a field's border, on a card or on the page, and the
 * focus ring, which theme.css draws in the primary action color.
 */
const OUTLINE_ON_BACKGROUND: readonly (readonly [outline: string, background: string])[] = [
  ["border-input", "background-surface"],
  ["border-input", "background-subtle"],
  ["action-primary", "background-surface"],
  ["action-primary", "background-subtle"],
];

const MIN_CONTRAST = 4.5;
const MIN_OUTLINE_CONTRAST = 3;
const HEX = /^#[0-9a-fA-F]{6}$/;
const semantic = (name: string) => `--brand-semantic-color-${name}`;

/** Follows var() chains to the literal value, or null for a missing or circular one. */
function literal(
  variables: Record<string, string>,
  name: string,
  seen = new Set<string>(),
): string | null {
  const value = variables[name];
  if (value === undefined || seen.has(name)) return null;
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias ? literal(variables, alias[1]!, seen.add(name)) : value;
}

/** WCAG 2.1 contrast ratio of two #rrggbb colors. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

export type BrandValidation =
  | { ok: true; variables: Record<string, string>; fontFamily: string[] }
  | { ok: false; problems: BrandProblem[] };

const fontFamilySchema = z.object({
  font: z.object({
    // Plain names only (no aliases, quotes, or commas): the web app quotes them itself (fonts.ts).
    family: z.object({
      base: z.object({ $value: z.array(z.string().regex(/^[A-Za-z0-9 -]+$/)).min(1) }),
    }),
  }),
});

export function validateBrandTokens(tokens: unknown): BrandValidation {
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return { ok: false, problems: [{ field: "tokens", message: "Must be a DTCG token object" }] };
  }
  let variables: Record<string, string>;
  try {
    variables = toCssVariables(tokens as Parameters<typeof toCssVariables>[0]);
  } catch (err) {
    return { ok: false, problems: [{ field: "tokens", message: (err as Error).message }] };
  }
  const problems: BrandProblem[] = REQUIRED_BRAND_VARIABLES.filter((n) => !(n in variables)).map(
    (name) => ({ field: name, message: "The theme needs this token" }),
  );
  const pairs = [
    ...TEXT_ON_BACKGROUND.map((pair) => [...pair, MIN_CONTRAST] as const),
    ...OUTLINE_ON_BACKGROUND.map((pair) => [...pair, MIN_OUTLINE_CONTRAST] as const),
  ];
  for (const [text, background, minimum] of pairs) {
    const fg = literal(variables, semantic(text));
    const bg = literal(variables, semantic(background));
    if (!fg || !bg || !HEX.test(fg) || !HEX.test(bg)) {
      problems.push({
        field: `${text} on ${background}`,
        message: "Both colors must be #rrggbb values",
      });
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < minimum) {
      problems.push({
        field: `${text} on ${background}`,
        message: `Contrast is ${ratio.toFixed(2)}:1; it must be at least ${minimum}:1`,
      });
    }
  }
  const font = fontFamilySchema.safeParse(tokens);
  if (!font.success) {
    problems.push({ field: "font.family.base", message: "Name at least one font family" });
  }
  return problems.length > 0 || !font.success
    ? { ok: false, problems }
    : { ok: true, variables, fontFamily: font.data.font.family.base.$value };
}
