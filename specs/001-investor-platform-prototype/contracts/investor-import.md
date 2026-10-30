# Contract: Investor Import File (Legacy Spreadsheet Export)

FR-061 and FR-079. This models the CSV export of the investor list kept in Google Sheets today.
A sample file, `seed/legacy-investors.csv`, ships with the prototype. It has 30 rows: 26 valid
and 4 deliberately invalid (a negative price, an unknown ZIP code, a missing email, and min
price above max).

## Format

- UTF-8 CSV with a header row, comma-delimited, quoted fields allowed.
- Maximum 5 MB or 10,000 rows.
- Header names are matched case-insensitively. Unknown columns are ignored, and their names are
  reported in the batch summary.

| Column | Required | Rule | Maps to |
| --- | --- | --- | --- |
| `Investor ID` | no | unique string | `Investor.externalRef` (upsert key) |
| `Company` | yes | 1–120 chars | `companyName` |
| `Contact Name` | yes | 1–80 chars | `contactName` |
| `Email` | yes | valid email | `email` (fallback upsert key) |
| `Phone` | no | US number, normalized to E.164 | `phone` |
| `Type` | yes | `Direct Buyer` \| `Wholesaler` \| `iBuyer` | `investorType` |
| `Markets` | yes | `ALL` (nationwide), or `;`-separated 2-letter state codes, or `;`-separated ZIP codes; states and ZIP codes can't be mixed in one row; every ZIP must be valid (`IGeoProvider`) | buy box `geographyMode` + `BuyBoxGeography` rows |
| `Property Types` | yes | `;`-separated: `SFR`, `Condo`, `Townhome`, `Multi`, `Manufactured`, `Land` | `propertyTypes` |
| `Min Price` / `Max Price` | yes | integers ≥ 0, min ≤ max | `priceMin` / `priceMax` |
| `Min Beds` / `Max Beds` | no | 0–20, min ≤ max | `bedsMin` / `bedsMax` |
| `Conditions` | no | `;`-separated condition names; blank means any | `conditionsAccepted` (null when blank) |
| `Max Repairs` | no | integer ≥ 0 | `repairMax` |
| `Close Within Days` | no | 7–120, default 30 | `closeWithinDays` |
| `Proof of Funds Expires` | no | `YYYY-MM-DD`; blank means not verified, so the investor is not matched until ops verify (FR-024) | `Investor.proofOfFundsExpiresAt` |
| `Active` | no | `Y` / `N`, default `Y` | `status` |

## Processing rules

- Each row runs in its own transaction. A row is either fully imported or updated, or rejected
  with a reason; partial records are never left behind.
- Matching existing investors: by `Investor ID` if present, otherwise by `Email`. A match is
  updated (`UPDATED`); otherwise a new investor is created (`IMPORTED`). Re-importing the same
  file therefore produces 0 new investors.
- Criterion rules (ranges, min ≤ max, non-empty lists) are not re-implemented here: each row is
  mapped to the buy box input and validated with the Criterion Registry schema (constitution
  XIX.3), and failing fields are reported with their CSV column names.
- Rejection reasons are specific, for example: `row 7: Max Price (-5) must be ≥ 0`,
  `row 12: ZIP 00000 is not a valid ZIP code`, `row 19: Email is required`.
- The import runs as an `IMPORT_INVESTORS` durable job (202 + `jobId`). Progress is reported in
  `Job.progress`.
- Each row maps to one default buy box for that investor (`isDefault: true`, name
  `Legacy Import`, other criteria from the columns). A re-import updates that box in place and
  never creates a second one; buy boxes the investor created in the app are not touched.
- A created or changed default box gets a new `BuyBoxVersion` and enqueues `MATCH_BUY_BOX`, so
  it is matched against packages still accepting offers (FR-023). New matches go to the
  dashboard and the daily digest, not instant messages.
