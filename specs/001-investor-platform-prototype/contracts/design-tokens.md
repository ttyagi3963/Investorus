# Contract: Brand Token Set (Design System)

FR-090 to FR-097; research R21. This is the interface any brand, including a future white-label
partner, must supply. Component code depends only on the **semantic utilities** in
`packages/ui/src/styles/theme.css` and never on a brand's values or ID.

Since Sprint 5 (T327, the owner's design bundle of 2026-11-01), a brand's tokens use the W3C Design
Tokens (DTCG) format the design tool exports, so a designer's export drops in unchanged. Since
Sprint 7 (T346–T353) brands live in the `Brand` table (data-model.md): the seed loads them from
`seed/brands/<brandId>/`, the api serves them, and operations can edit a brand's tokens in the
console without a deploy.

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

Checked by `brandContentSchema` in `packages/contracts/src/brand/brand.ts`. The logo lives in
`apps/web/public/brands/<brandId>/`.

### `hosts.json`

The addresses that open the brand, for example `["partner.localhost"]`. At least one.

## How a brand is stored and chosen

1. **Seed** (`packages/core/src/infra/seed/brands.ts`): every folder in `seed/brands/` is validated
   (below) and written to the `Brand` table with a hash of its files. A brand is rewritten only
   when its files changed, which bumps `tokenVersion`; a theme an operator edited survives a
   restart. A brand that fails validation stops the seed with every failure named.
2. **Api** (api.md, "Brands"): `GET /brands` (the switcher and the host mapping) and
   `GET /brands/:id/theme` (the CSS variables, font stack, and content) are public, because the
   sign-in page needs them. The theme's `ETag` is its version, with `Cache-Control: public,
   max-age=60`; a caller holding the current version gets a 304.
3. **Web** (`apps/web/src/brand/active-brand.ts`): each request picks one brand: the `brand` cookie
   the switcher sets, if it names a brand; else the brand whose `hosts` include the request's host;
   else `DEFAULT_BRAND_ID`. The list and theme come through Next's data cache (60 seconds, tag
   `brands`), which the theme editor drops after a save.
4. **Messages**: emails and texts carry the name of `DEFAULT_BRAND_ID` (the worker's setting).

## How the tokens reach the screens

1. `packages/contracts/src/brand/tokens.ts` converts every token to a CSS custom property named
   `--brand-<path>` (`color.blue.700` → `--brand-color-blue-700`). An alias stays a reference
   (`var(--brand-color-blue-700)`), and a typography token becomes one property per part
   (`--brand-typography-heading-1-font-size`, …).
2. The root layout writes them in one `:root` rule for the request's brand, and loads the brand's
   font with `next/font` (`apps/web/src/brand/fonts.ts`; a brand's first font must be registered
   there to load, otherwise its fallback fonts are used).
3. `packages/ui/src/styles/theme.css` maps each Tailwind utility to one of these properties, for
   example `bg-action-primary` → `--brand-semantic-color-action-primary` or `text-heading-lg` →
   the `heading-1` typography. Tailwind's default palette is removed, so a color can only come
   from the brand.

## Validation (refused with the failing token named)

One validator, `validateBrandTokens` in `packages/contracts/src/brand/brand.ts`, used by the seed,
the api's theme save, and the tests. It returns every failure as `{ field, message }`:

1. Every alias points at an existing token, and no value contains a character that could end a CSS
   declaration or the style element (`tokens.ts`). Field: `tokens`.
2. The brand supplies every `--brand-*` property theme.css reads (`REQUIRED_BRAND_VARIABLES` in
   `required.ts`; a web test keeps that list equal to what theme.css reads). Field: the variable.
3. Contrast is at least 4.5:1 for every text and background pair the screens use
   (`TEXT_ON_BACKGROUND`): primary, muted, link, and error text on the surface and page
   backgrounds; text on the primary, success, and CTA actions; inverse text on the operations
   header; and each status's text on its own background. Field: the pair, for example
   `text-muted on background-surface`, with the ratio in the message.

## Editing a brand (`/ops/brands`, T353)

Operations pick a brand, edit its `tokens.json` as text or upload a file, and save. The save sends
the `tokenVersion` the editor loaded; if another save came first the api answers 409 and nothing is
overwritten. A refused file is listed problem by problem. A saved file bumps the version, is
audited (`BRAND_THEME_UPDATED`), and shows on every page at once. Content and hosts are edited in
the seed files only.

The living style guide at `/design-system` (T352) shows the request's brand: its semantic colors
with their resolved values, type scale, spacing, shapes, and every component in each state.

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

## The `larkspur` partner brand (T350)

A fictional partner, Larkspur Home Offers, on `partner.localhost`. Same token paths as `clever`,
following the owner's earlier `brand-beta` direction (teal actions, pill buttons, 4px cards) with
its own values so every pair passes AA: teal actions and links (`#0a6359`), pine ink and operations
header (`#0d2e29`), a coral call to action with dark text (`#ffab85`), Nunito Sans, button radius
`{radius.pill}`, and `radius.lg` of 4px. Inputs keep `radius.sm` (4px).

A new brand is another `seed/brands/<brandId>/` folder (`tokens.json`, `content.json`,
`hosts.json`) and a logo; its web font, if any, is registered in `fonts.ts`. No code names a brand.

Buttons read `component.button-primary.radius` (`rounded-button`), so a brand can shape buttons
apart from inputs.
