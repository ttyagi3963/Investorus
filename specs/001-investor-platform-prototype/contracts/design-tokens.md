# Contract: Brand Token Set (Design System)

FR-090 to FR-097; research R21. This is the interface any brand, including a future
white-label partner, must supply. It is validated by `brandTokenSetSchema` in
`@clever/contracts/brand`. Component code depends only on the **semantic** names below and
never on primitives or brand IDs.

## File shape (`seed/brands/<brandId>.json` → `Brand.themeTokens`)

```json
{
  "brandId": "clever",
  "version": 1,
  "primitives": {
    "color": { "blue-600": "#…", "blue-700": "#…", "gray-50": "#…", "gray-900": "#…", "red-600": "#…" },
    "font": { "sans": "…, system-ui, sans-serif", "display": "…" },
    "fontSize": { "xs": "0.75rem", "sm": "0.875rem", "md": "1rem", "lg": "1.25rem", "xl": "1.5rem", "2xl": "2rem" },
    "space": { "1": "0.25rem", "2": "0.5rem", "3": "0.75rem", "4": "1rem", "6": "1.5rem", "8": "2rem" },
    "radius": { "sm": "4px", "md": "8px", "lg": "16px", "pill": "999px" },
    "shadow": { "sm": "…", "md": "…" }
  },
  "semantic": {
    "color.action.primary": "color.blue-600",
    "color.action.primary-hover": "color.blue-700",
    "…": "…"
  },
  "content": { "displayName": "Clever Offers", "logoPath": "/brands/clever/logo.svg", "legalFooter": "…" }
}
```

- Hex values are `#RRGGBB`.
- Every `semantic` value must reference an existing primitive.
- Raw values are not allowed in `semantic`.

## Required semantic tokens

| Group | Tokens |
| --- | --- |
| Action | `color.action.primary`, `color.action.primary-hover`, `color.action.on-primary`, `color.action.secondary`, `color.action.on-secondary` |
| Surface | `color.surface.page`, `color.surface.card`, `color.surface.raised`, `color.surface.inverse` |
| Text | `color.text.default`, `color.text.muted`, `color.text.inverse`, `color.text.link` |
| Border | `color.border.default`, `color.border.strong` |
| Status | For each tone `neutral`, `info`, `success`, `warning`, `danger`: `color.status.<tone>` (indicator: dots, icons, borders), `color.status.<tone>-text` (status text and badge labels), `color.status.<tone>-surface` (badge background) |
| Brand accent | `color.brand.accent` (decorative only; never used for text) |
| Focus | `color.focus.ring` |
| Type | `font.body`, `font.heading`, `text.body`, `text.label`, `text.heading-sm`, `text.heading-md`, `text.heading-lg` |
| Space | `space.inset.{sm,md,lg}`, `space.stack.{sm,md,lg}`, `space.inline.{sm,md}` |
| Shape | `radius.control`, `radius.card`, `radius.badge` |
| Elevation | `shadow.card`, `shadow.overlay` |

Each token is exposed as the CSS custom property `--<token with dots → dashes>`, for example
`--color-action-primary`, and as a Tailwind utility, for example `bg-action-primary` or
`p-inset-md`.

## Validation rules (rejected with the failing token named)

1. All required semantic tokens are present (FR-091).
2. Contrast is at least 4.5:1 for:
   - `text.default`, `text.muted`, and `text.link` on `surface.page` and `surface.card`;
   - `action.on-primary` on `action.primary` and `action.primary-hover`;
   - `action.on-secondary` on `action.secondary`;
   - each `status.<tone>-text` on `status.<tone>-surface` and on `surface.card`.
3. Contrast is at least 3:1 for:
   - `focus.ring` on `surface.page` and `surface.card`;
   - `border.strong` on `surface.card`;
   - each `status.<tone>` indicator on `surface.card` (FR-095).
4. `content.displayName` is present. The logo path must resolve.

## Domain status → tone (`packages/ui/src/tokens/status-tones.ts`)

Screens never pick a status color directly. A status pill takes a domain status and looks up its
tone:

| Tone | Package / offer / deal / delivery statuses |
| --- | --- |
| `neutral` | DRAFT, WITHDRAWN, EXPIRED, DECLINED, CLOSED |
| `info` | ACCEPTING_OFFERS, matched, ACTIVE, PENDING, SENDING, PENDING_RECONFIRMATION |
| `success` | OFFER_ACCEPTED, UNDER_CONTRACT, INSPECTION, CLOSING, ACCEPTED, SENT |
| `warning` | NO_OFFERS_RECEIVED, COUNTERED, BACKUP, RETRYING |
| `danger` | FELL_THROUGH, NEEDS_ATTENTION, DECLINED_TO_RECONFIRM, RECONFIRM_DECLINED |

## Seeded brand values (owner-supplied 2026-10-30)

The owner supplied the values below. Each one is stored unchanged as a primitive in
`seed/brands/<brandId>.json`. Where a supplied value fails WCAG AA in a text role, the
semantic mapping points that role to a darker shade of the same hue, and the supplied value is
kept for the non-text role (indicator, focus, accent). Ratios were computed with the WCAG 2.1
formula.

### `clever` (owner name: "Brand Alpha"; the brand ID stays `clever`, because `brand-alpha` is reserved for synthetic test fixtures)

| Supplied | Value | Semantic use | Result |
| --- | --- | --- | --- |
| brand-primary | `#0052FF` | `action.primary`, `text.link`, `focus.ring` | white text 5.75 ✅, link on page 5.50 ✅ |
| brand-primary-hover | `#0043CC` | `action.primary-hover` | white text 7.85 ✅ |
| brand-secondary | `#0A192F` | `action.secondary`, `surface.inverse` | white text 17.60 ✅ |
| surface-bg | `#F8FAFC` | `surface.page` | |
| surface-card | `#FFFFFF` | `surface.card`, `surface.raised`, `action.on-primary`, `text.inverse` | |
| text-primary | `#0F172A` | `text.default` | 17.06 on page ✅ |
| text-muted | `#64748B` | `text.muted`, `border.strong` | 4.55 on page ✅, 4.76 on card ✅ |
| status-draft | `#64748B` | `status.neutral` | indicator 4.76 ✅ |
| status-matched | `#0284C7` | `status.info` (indicator only) | as text 4.10 ❌ → `status.info-text` = `#0369A1` (5.17 on `#E0F2FE`) |
| status-accepted | `#16A34A` | `status.success` (indicator only) | as text 3.30 ❌ → `status.success-text` = `#15803D` (4.57 on `#DCFCE7`) |
| status-needs-attention | `#DC2626` | `status.danger` | 4.83 ✅; `status.danger-text` = `#B91C1C` (5.30 on `#FEE2E2`) |
| (derived) | `#B45309` / `#FEF3C7` | `status.warning`, `status.warning-text` / `-surface` | 4.51 ✅ |
| (derived) | `#475569` / `#F1F5F9` | `status.neutral-text` / `-surface` | 6.92 ✅ |
| (derived) | `#0052FF` | `brand.accent` | |

### `brand-beta` (fictional white-label partner)

| Supplied | Value | Semantic use | Result |
| --- | --- | --- | --- |
| brand-primary | `#0D9488` | `focus.ring`, `brand.accent` | white text 3.74 ❌, so not used for `action.primary`; focus ring 3.40 on page ✅ |
| brand-primary-hover | `#0F766E` | `action.primary`, `text.link` | white text 5.47 ✅, link on page 4.97 ✅ |
| (derived) | `#115E59` | `action.primary-hover` | white text 7.58 ✅ |
| brand-secondary | `#111827` | `action.secondary`, `surface.inverse` | white text 17.74 ✅ |
| surface-bg | `#F3F4F6` | `surface.page` | |
| surface-card | `#FFFFFF` | `surface.card`, `surface.raised`, `action.on-primary`, `text.inverse` | |
| text-primary | `#1F2937` | `text.default` | 13.34 on page ✅ |
| text-muted | `#6B7280` | `border.strong` | as text on page 4.39 ❌ → `text.muted` = `#4B5563` (6.87) |
| status-draft | `#6B7280` | `status.neutral` | `status.neutral-text` = `#4B5563` |
| status-matched | `#0284C7` | `status.info` (indicator only) | `status.info-text` = `#0369A1` (5.17) |
| status-accepted | `#059669` | `status.success` (indicator only) | as text 3.77 ❌ → `status.success-text` = `#047857` (4.84 on `#D1FAE5`) |
| status-needs-attention | `#E11D48` | `status.danger` | 4.70 ✅; `status.danger-text` = `#BE123C` (5.24 on `#FFE4E6`) |
| (derived) | `#B45309` / `#FEF3C7` | `status.warning`, `-text` / `-surface` | 4.51 ✅ |

Type, spacing, radius, and shadow primitives are not part of the supplied set. Both brands use
the scales in the file shape above. `brand-beta` uses `radius.control` = `999px` (pill) and
`radius.card` = `4px`, so the switch is visible even where colors are close.
