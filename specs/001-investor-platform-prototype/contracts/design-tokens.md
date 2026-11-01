# Contract: Brand Token Set (Design System)

FR-090 to FR-097; research R21. This is the interface any brand, including a future white-label
partner, must supply. Component code depends only on the **semantic utilities** in
`packages/ui/src/styles/theme.css` and never on a brand's values or ID.

Since Sprint 5 (T327, the owner's design bundle of 2026-11-01), a brand is two files in
`seed/brands/<brandId>/`, and its tokens use the W3C Design Tokens (DTCG) format the design tool
exports, so a designer's export drops in unchanged.

## Files

### `tokens.json` (DTCG)

Three layers, as in the bundle's `clever-design-tokens.v2.json`:

1. **Brand values**: `color`, `font`, `typography`, `space`, `layout`, `radius`, `shadow`, `motion`,
   `size`. Colors are `#rrggbb` or `rgba(…)`; dimensions are `{ "value": 24, "unit": "px" }`;
   typography is a composite of `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, and
   `letterSpacing`; shadows are `{ color, offsetX, offsetY, blur, spread }`.
2. **`semantic.color`**: role names (`text.primary`, `action.primary`,
   `status.open.background`) whose values alias brand values (`"{color.blue.700}"`).
3. **`component`**: token bundles (button, input, card, status chip, thumbnail) that alias the
   layers above.

Every token may carry `$extensions["com.investorus.origin"]`: `site`, `site-default`, `adjusted`
(changed from the live site for contrast), or `added` (new for the prototype).

### `content.json`

```json
{
  "brandId": "clever",
  "displayName": "…",
  "productName": "…",
  "opsProductName": "…",
  "logoPath": "/brands/<brandId>/logo.svg",
  "signIn": { "headline": "…", "intro": "…", "steps": ["…"] }
}
```

Checked by the content schema in `apps/web/src/brand/brands.ts`. The logo lives in
`apps/web/public/brands/<brandId>/`.

## How the tokens reach the screens

1. `apps/web/src/brand/tokens.ts` converts every token to a CSS custom property named
   `--brand-<path>` (`color.blue.700` → `--brand-color-blue-700`). An alias stays a reference
   (`var(--brand-color-blue-700)`), and a typography token becomes one property per part
   (`--brand-typography-heading-1-font-size`, …).
2. The root layout writes them in one `:root` rule for the active brand
   (`DEFAULT_BRAND_ID`; resolution by host or cookie is T094), and loads the brand's font with
   `next/font` (`apps/web/src/brand/fonts.ts`).
3. `packages/ui/src/styles/theme.css` maps each Tailwind utility to one of these properties, for
   example `bg-action-primary` → `--brand-semantic-color-action-primary` or `text-heading-lg` →
   the `heading-1` typography. Tailwind's default palette is removed, so a color can only come
   from the brand.

## Validation (refused with the failing token named)

1. Every alias points at an existing token, and no value contains a character that could end a CSS
   declaration or the style element (`tokens.ts`).
2. The brand supplies every `--brand-*` property theme.css reads (`brand.test.ts`).
3. Contrast is at least 4.5:1 for every text and background pair the screens use
   (`brand.test.ts`): primary, muted, link, and error text on the surface and page backgrounds;
   text on the primary, success, and CTA actions; inverse text on the operations header; and each
   status's text on its own background.

## Domain status → tone (`packages/ui/src/tokens/status-tones.ts`)

Screens never pick a status color. A status chip takes a tone from these maps; the tones are the
brand's `semantic.color.status.*` roles.

| Tone | Package / offer / deal / buy box / import statuses |
| --- | --- |
| `draft` | DRAFT, WITHDRAWN; offers DECLINED, WITHDRAWN, EXPIRED; buy box PAUSED |
| `open` | ACCEPTING_OFFERS; offer ACTIVE; import QUEUED, RUNNING; row UPDATED |
| `offers-in` | NO_OFFERS_RECEIVED; offer COUNTERED, BACKUP; deal PENDING_RECONFIRMATION |
| `under-contract` | OFFER_ACCEPTED, UNDER_CONTRACT, INSPECTION, CLOSING; offer ACCEPTED; buy box ACTIVE; import COMPLETED; row IMPORTED |
| `closed` | CLOSED |
| `error` | FELL_THROUGH, DECLINED_TO_RECONFIRM, RECONFIRM_DECLINED; import FAILED; row REJECTED |

## The `clever` brand

The tokens are the owner's design bundle, `clever-design-tokens.v2.json` (base values extracted
from cleveroffers.com on 2026-10-31). Four semantic colors differ from the site so every pair
passes WCAG AA: `action.primary` and `text.link` use `#005bb8`; `text.on-cta` is dark text on the
orange CTA; `action.success` is `#04694a`; `text.placeholder` is `#6a6a75`. The repository's copy adds
four tokens the screen sources use, marked `added`: `typography.field-label` (14px semibold),
`typography.helper` (13px), `layout.app-header-height` (64px), and `layout.page-padding-x`.

These replace the values the owner supplied on 2026-10-30 (`#0052FF` primary and its derived
status colors), which this contract listed before Sprint 5.

## A second brand (T201, not built)

A white-label partner is another `seed/brands/<brandId>/` folder with the same token paths and its
own content and logo, registered in `apps/web/src/brand/brands.ts` (and its font in `fonts.ts` if it
uses a web font). The owner's earlier `brand-beta` values (teal `#0D9488` with `#0F766E` for text and
actions, pill controls, 4px cards) are to be expressed in this format when T201 is built.
