// Reads the legacy investor spreadsheet (T322; FR-061, contracts/investor-import.md). It handles
// only the columns: headers matched case-insensitively, `;` lists, the old names for types, ZIP
// codes known to the lookup, dates, and phones. Each row's buy box goes through the registry's own
// schema (XIX.3), so no range or min ≤ max rule lives here; a failing field is reported with its
// CSV column name. Rows are numbered as the spreadsheet shows them, the header being row 1.
import { buyBoxInputSchema, type BuyBoxInput } from "@clever/contracts/buy-box";
import { ValidationError } from "@clever/contracts/common";
import {
  MAX_IMPORT_BYTES,
  type InvestorStatus,
  type InvestorType,
} from "@clever/contracts/investor";
import { z } from "zod";
import type { IGeoProvider } from "../../providers/geo/IGeoProvider.js";
import { checkZips } from "../../services/buy-box/check-zips.js";

const MAX_ROWS = 10_000;

/** The investor a valid row describes; `externalRef` is the upsert key, else `email`. */
export type ImportedInvestor = {
  externalRef: string | null;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  investorType: InvestorType;
  status: InvestorStatus;
  proofOfFundsExpiresAt: Date | null;
};

export type ParsedRow =
  | { rowNumber: number; ok: true; investor: ImportedInvestor; box: BuyBoxInput }
  | { rowNumber: number; ok: false; reason: string };

export type ParsedFile = { rows: ParsedRow[]; ignoredColumns: string[] };

/** The whole file is refused: too large, too many rows, or a required column missing. */
export class FileRefusedError extends Error {}

const COLUMNS = {
  investorId: "Investor ID",
  company: "Company",
  contact: "Contact Name",
  email: "Email",
  phone: "Phone",
  type: "Type",
  markets: "Markets",
  propertyTypes: "Property Types",
  minPrice: "Min Price",
  maxPrice: "Max Price",
  minBeds: "Min Beds",
  maxBeds: "Max Beds",
  conditions: "Conditions",
  maxRepairs: "Max Repairs",
  closeWithin: "Close Within Days",
  proofOfFunds: "Proof of Funds Expires",
  active: "Active",
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = [
  "company",
  "contact",
  "email",
  "type",
  "markets",
  "propertyTypes",
  "minPrice",
  "maxPrice",
];

/** Each buy box field the file fills, by the column it comes from (for the reasons). */
const CRITERION_COLUMNS: Partial<Record<keyof BuyBoxInput, string>> = {
  geographyMode: COLUMNS.markets,
  geography: COLUMNS.markets,
  propertyTypes: COLUMNS.propertyTypes,
  priceMin: COLUMNS.minPrice,
  priceMax: COLUMNS.maxPrice,
  bedsMin: COLUMNS.minBeds,
  bedsMax: COLUMNS.maxBeds,
  conditionsAccepted: COLUMNS.conditions,
  repairMax: COLUMNS.maxRepairs,
  closeWithinDays: COLUMNS.closeWithin,
};

const TYPES: Record<string, InvestorType> = {
  "direct buyer": "DIRECT_BUYER",
  wholesaler: "WHOLESALER",
  ibuyer: "IBUYER",
};
const PROPERTY_TYPES: Record<string, NonNullable<BuyBoxInput["propertyTypes"]>[number]> = {
  sfr: "SINGLE_FAMILY",
  condo: "CONDO",
  townhome: "TOWNHOME",
  multi: "MULTI_FAMILY",
  manufactured: "MANUFACTURED",
  land: "LAND",
};
const CONDITIONS: Record<string, NonNullable<BuyBoxInput["conditionsAccepted"]>[number]> = {
  excellent: "EXCELLENT",
  good: "GOOD",
  fair: "FAIR",
  poor: "POOR",
  distressed: "DISTRESSED",
};

/** A row the parser refuses, with the reason already worded for operations. */
class RowError extends Error {}

/** RFC 4180: comma-separated, fields may be quoted, a quote inside one is doubled. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length > 0) rows.push([...row, field]);
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const list = (value: string) =>
  value
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item !== "");

function names<T>(value: string, known: Record<string, T>, column: string): T[] {
  return list(value).map((name) => {
    const found = known[name.toLowerCase()];
    if (found === undefined)
      throw new RowError(`${column}: ${name} is not one of ${Object.keys(known).join(", ")}`);
    return found;
  });
}

function wholeNumber(value: string, column: string): number | null {
  if (value === "") return null;
  if (!/^-?\d+$/.test(value)) throw new RowError(`${column} (${value}) is not a whole number`);
  return Number(value);
}

function markets(value: string): Pick<BuyBoxInput, "geographyMode" | "geography"> {
  if (value.toUpperCase() === "ALL") return { geographyMode: "NATIONWIDE", geography: [] };
  const places = list(value).map((place) => place.toUpperCase());
  const zips = places.filter((place) => /^\d+$/.test(place));
  if (zips.length > 0 && zips.length < places.length) {
    throw new RowError(`${COLUMNS.markets} mixes states and ZIP codes`);
  }
  return { geographyMode: zips.length > 0 ? "ZIPS" : "STATES", geography: places };
}

function phone(value: string): string | null {
  if (value === "") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new RowError(`${COLUMNS.phone} (${value}) is not a US phone number`);
}

function proofOfFunds(value: string): Date | null {
  if (value === "") return null;
  if (!z.iso.date().safeParse(value).success) {
    throw new RowError(`${COLUMNS.proofOfFunds} (${value}) is not a YYYY-MM-DD date`);
  }
  return new Date(`${value}T00:00:00Z`);
}

function investorOf(cell: (column: Column) => string): ImportedInvestor {
  const text = (column: Column, max: number) => {
    const value = cell(column);
    if (value.length > max)
      throw new RowError(`${COLUMNS[column]} is longer than ${max} characters`);
    return value;
  };
  const email = cell("email").toLowerCase();
  if (!z.email().safeParse(email).success) {
    throw new RowError(`${COLUMNS.email} (${email}) is not a valid email`);
  }
  const type = TYPES[cell("type").toLowerCase()];
  if (!type)
    throw new RowError(
      `${COLUMNS.type} (${cell("type")}) is not Direct Buyer, Wholesaler, or iBuyer`,
    );
  const active = cell("active").toUpperCase() || "Y";
  if (active !== "Y" && active !== "N")
    throw new RowError(`${COLUMNS.active} (${active}) is not Y or N`);
  return {
    externalRef: cell("investorId") || null,
    companyName: text("company", 120),
    contactName: text("contact", 80),
    email,
    phone: phone(cell("phone")),
    investorType: type,
    status: active === "Y" ? "ACTIVE" : "INACTIVE",
    proofOfFundsExpiresAt: proofOfFunds(cell("proofOfFunds")),
  };
}

function boxOf(cell: (column: Column) => string, geo: IGeoProvider): BuyBoxInput {
  const conditions = cell("conditions");
  const raw = {
    name: "Legacy Import",
    strategy: null,
    status: "ACTIVE",
    ...markets(cell("markets")),
    propertyTypes: names(cell("propertyTypes"), PROPERTY_TYPES, COLUMNS.propertyTypes),
    priceMin: wholeNumber(cell("minPrice"), COLUMNS.minPrice),
    priceMax: wholeNumber(cell("maxPrice"), COLUMNS.maxPrice),
    yearBuiltMin: null,
    yearBuiltMax: null,
    bedsMin: wholeNumber(cell("minBeds"), COLUMNS.minBeds),
    bedsMax: wholeNumber(cell("maxBeds"), COLUMNS.maxBeds),
    bathsMin: null,
    bathsMax: null,
    sqftMin: null,
    sqftMax: null,
    unitsMin: null,
    unitsMax: null,
    conditionsAccepted:
      conditions === "" ? null : names(conditions, CONDITIONS, COLUMNS.conditions),
    repairMax: wholeNumber(cell("maxRepairs"), COLUMNS.maxRepairs),
    closeWithinDays: wholeNumber(cell("closeWithin"), COLUMNS.closeWithin) ?? 30,
    acceptsListed: true,
    programsAccepted: null,
  };
  const parsed = buyBoxInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    const field = String(issue.path[0]) as keyof BuyBoxInput;
    const column = CRITERION_COLUMNS[field] ?? field;
    const value = raw[field as keyof typeof raw];
    const shown = typeof value === "number" ? ` (${value})` : "";
    throw new RowError(`${column}${shown}: ${issue.message}`);
  }
  try {
    checkZips(parsed.data, geo);
  } catch (err) {
    if (err instanceof ValidationError) {
      const fields = (err.details?.fields ?? []) as { message: string }[];
      throw new RowError(`${COLUMNS.markets}: ${fields[0]?.message ?? err.message}`);
    }
    throw err;
  }
  return parsed.data;
}

export function parseLegacyCsv(file: Buffer, geo: IGeoProvider): ParsedFile {
  if (file.byteLength > MAX_IMPORT_BYTES)
    throw new FileRefusedError("The file is larger than 5 MB");
  const [header = [], ...lines] = parseCsv(file.toString("utf8").replace(/^\uFEFF/, ""));
  if (lines.length > MAX_ROWS) throw new FileRefusedError("The file has more than 10,000 rows");

  const index = new Map(header.map((name, i) => [name.trim().toLowerCase(), i]));
  const known = new Set(Object.values(COLUMNS).map((name) => name.toLowerCase()));
  const missing = REQUIRED.filter((column) => !index.has(COLUMNS[column].toLowerCase()));
  if (missing.length > 0) {
    throw new FileRefusedError(
      `The file has no ${missing.map((column) => COLUMNS[column]).join(", ")} column`,
    );
  }

  const rows = lines.map((cells, i): ParsedRow => {
    const rowNumber = i + 2;
    const cell = (column: Column) =>
      (cells[index.get(COLUMNS[column].toLowerCase()) ?? -1] ?? "").trim();
    try {
      const missingValue = REQUIRED.find((column) => cell(column) === "");
      if (missingValue) throw new RowError(`${COLUMNS[missingValue]} is required`);
      return { rowNumber, ok: true, investor: investorOf(cell), box: boxOf(cell, geo) };
    } catch (err) {
      if (err instanceof RowError) {
        return { rowNumber, ok: false, reason: `row ${rowNumber}: ${err.message}` };
      }
      throw err;
    }
  });
  return {
    rows,
    ignoredColumns: header
      .map((name) => name.trim())
      .filter((name) => !known.has(name.toLowerCase())),
  };
}
