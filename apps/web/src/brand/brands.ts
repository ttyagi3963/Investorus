// The brands the web app can render (T327; constitution X, XVI): each one's tokens and content come
// from its data files in seed/brands/<id>/, never from components. A brand is checked and converted
// once, the first time it is asked for. The active brand is DEFAULT_BRAND_ID until brand resolution
// by host or cookie arrives (T094).
import { z } from "zod";
import cleverContent from "../../../../seed/brands/clever/content.json";
import cleverTokens from "../../../../seed/brands/clever/tokens.json";
import { toCssVariables } from "./tokens";

const brandContentSchema = z.object({
  brandId: z.string().min(1),
  displayName: z.string().min(1),
  productName: z.string().min(1),
  opsProductName: z.string().min(1),
  logoPath: z.string().startsWith("/"),
  signIn: z.object({
    headline: z.string().min(1),
    intro: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
  }),
});
export type BrandContent = z.infer<typeof brandContentSchema>;

const fontFamilySchema = z.object({
  font: z.object({ family: z.object({ base: z.object({ $value: z.array(z.string()).min(1) }) }) }),
});

const SOURCES = {
  clever: { tokens: cleverTokens, content: cleverContent },
} as const;

export type BrandId = keyof typeof SOURCES;
export const BRAND_IDS = Object.keys(SOURCES) as [BrandId, ...BrandId[]];

export type Brand = {
  id: BrandId;
  content: BrandContent;
  /** --brand-* custom properties for the theme (styles/theme.css). */
  variables: Record<string, string>;
  /** The base font stack, the brand's own font first. */
  fontFamily: string[];
};

const loaded = new Map<BrandId, Brand>();

export function loadBrand(id: BrandId): Brand {
  const cached = loaded.get(id);
  if (cached) return cached;
  const source = SOURCES[id];
  const content = brandContentSchema.parse(source.content);
  if (content.brandId !== id) throw new Error(`Brand ${id}'s content names ${content.brandId}`);
  const brand: Brand = {
    id,
    content,
    variables: toCssVariables(source.tokens),
    fontFamily: fontFamilySchema.parse(source.tokens).font.family.base.$value,
  };
  loaded.set(id, brand);
  return brand;
}
