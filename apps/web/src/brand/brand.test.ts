// @vitest-environment node
// Guards the brand layer (T327, T328; contracts/design-tokens.md): every brand supplies every
// variable the theme reads, its text and background pairs meet WCAG AA, and a token value that
// could break out of the page's style element is refused.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_IDS, loadBrand } from "./brands";
import { toCssVariables } from "./tokens";

const theme = readFileSync(
  new URL("../../../../packages/ui/src/styles/theme.css", import.meta.url),
  "utf8",
);
const themeReads = [...new Set([...theme.matchAll(/var\((--brand-[\w-]+)\)/g)].map((m) => m[1]!))];

/** Follows var() chains to the brand's literal value. */
function literal(variables: Record<string, string>, name: string): string {
  const value = variables[name];
  if (value === undefined) throw new Error(`${name} is not defined`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  return alias ? literal(variables, alias[1]!) : value;
}

/** WCAG 2.1 contrast ratio of two #rrggbb colors. */
function contrast(a: string, b: string): number {
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

const semantic = (path: string) => `--brand-semantic-color-${path}`;
const TEXT_ON_BACKGROUND: [string, string][] = [
  ["text-primary", "background-surface"],
  ["text-primary", "background-subtle"],
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
    (s): [string, string] => [`status-${s}-text`, `status-${s}-background`],
  ),
];

describe.each(BRAND_IDS)("brand %s", (id) => {
  const { variables } = loadBrand(id);

  it("supplies every variable the theme reads", () => {
    expect(themeReads.filter((name) => !(name in variables))).toEqual([]);
  });

  it("keeps every text and background pair at 4.5:1 or more", () => {
    const failing = TEXT_ON_BACKGROUND.filter(
      ([text, background]) =>
        contrast(literal(variables, semantic(text)), literal(variables, semantic(background))) <
        4.5,
    );
    expect(failing).toEqual([]);
  });
});

describe("toCssVariables", () => {
  it("refuses a value that could close the style element, and an alias to nothing", () => {
    expect(() => toCssVariables({ color: { bad: { $value: "red</style><script>" } } })).toThrow(
      /color\.bad/,
    );
    expect(() => toCssVariables({ color: { link: { $value: "{color.missing}" } } })).toThrow(
      /color\.missing/,
    );
  });
});
