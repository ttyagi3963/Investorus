// Guards the brand rules (T347; FR-091, FR-095, SC-015): every brand in seed/brands/ supplies every
// variable the theme reads and passes WCAG AA; a token set missing a variable, with an unreadable
// text pair, or with a value that could break out of the page's style element is refused, each
// failure named.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandContentSchema, validateBrandTokens } from "./brand.js";

const BRANDS_DIR = new URL("../../../../seed/brands/", import.meta.url);
const brandIds = readdirSync(BRANDS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const read = (id: string, file: string): unknown =>
  JSON.parse(readFileSync(new URL(`${id}/${file}`, BRANDS_DIR), "utf8"));

describe.each(brandIds)("seed brand %s", (id) => {
  it("passes the token checks and the content schema", () => {
    expect(validateBrandTokens(read(id, "tokens.json"))).toMatchObject({ ok: true });
    expect(brandContentSchema.parse(read(id, "content.json")).brandId).toBe(id);
  });
});

describe("validateBrandTokens", () => {
  const clever = read("clever", "tokens.json") as Record<string, Record<string, unknown>>;

  it("names a missing variable and a text pair under 4.5:1 with its ratio", () => {
    const tokens = structuredClone(clever);
    delete (tokens.layout as Record<string, unknown>)["page-padding-x"];
    (tokens.color as { neutral: Record<string, { $value: string }> }).neutral["500"]!.$value =
      "#bbbbbb";

    const result = validateBrandTokens(tokens);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContainEqual(
      expect.objectContaining({ field: "--brand-layout-page-padding-x" }),
    );
    expect(result.problems).toContainEqual({
      field: "text-muted on background-surface",
      message: expect.stringMatching(/^Contrast is 1\.\d\d:1; it must be at least 4\.5:1$/),
    });
  });

  it("holds the input border to 3:1 (WCAG 1.4.11) and the heading text to 4.5:1", () => {
    const tokens = structuredClone(clever);
    const color = (tokens.semantic as { color: Record<string, Record<string, { $value: string }>> })
      .color;
    color.border!.input!.$value = "#dddedf";
    color.text!.heading!.$value = "#bbbbbb";

    const result = validateBrandTokens(tokens);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toContainEqual({
      field: "border-input on background-surface",
      message: "Contrast is 1.35:1; it must be at least 3:1",
    });
    expect(result.problems).toContainEqual(
      expect.objectContaining({ field: "text-heading on background-surface" }),
    );
  });

  it("refuses a logo path that leaves the site", () => {
    const content = read("clever", "content.json") as Record<string, unknown>;
    for (const logoPath of ["//evil.example/logo.svg", "/\\evil.example/logo.svg"]) {
      expect(brandContentSchema.safeParse({ ...content, logoPath }).success).toBe(false);
    }
  });

  it("refuses aliases that point back at themselves", () => {
    const cycle = { space: { a: { $value: "{space.b}" }, b: { $value: "{space.a}" } } };
    expect(validateBrandTokens(cycle)).toEqual({
      ok: false,
      problems: [{ field: "tokens", message: expect.stringContaining("space") }],
    });
  });

  it("refuses a name or value that could break out of the style element, and an alias to nothing", () => {
    const breakout = "x:red}</style><script>alert(1)</script><style>";
    expect(validateBrandTokens({ color: { bad: { $value: "red</style><script>" } } })).toEqual({
      ok: false,
      problems: [{ field: "tokens", message: expect.stringContaining("color.bad") }],
    });
    expect(validateBrandTokens({ color: { [breakout]: { $value: "#ffffff" } } })).toMatchObject({
      ok: false,
    });
    expect(validateBrandTokens({ color: { open: { $value: "red /*" } } })).toMatchObject({
      ok: false,
    });
    expect(validateBrandTokens({ color: { link: { $value: "{color.missing}" } } })).toEqual({
      ok: false,
      problems: [{ field: "tokens", message: expect.stringContaining("color.missing") }],
    });
  });
});
