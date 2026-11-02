// Guards the legacy file's reading (T322; FR-061, contracts/investor-import.md): the sample file
// gives 26 valid rows and 4 rejected ones, each with a reason naming its spreadsheet row and
// column; the old column values map to ours, with their defaults; a row mixing states and ZIP codes
// is rejected; and a file missing a required column is refused whole.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StaticGeoProviderImpl } from "../../providers/geo/StaticGeoProviderImpl.js";
import { FileRefusedError, parseLegacyCsv } from "./parse-legacy-csv.js";

const geo = new StaticGeoProviderImpl();
const sample = readFileSync(new URL("../../../../../seed/legacy-investors.csv", import.meta.url));
const HEADER =
  "Investor ID,Company,Contact Name,Email,Phone,Type,Markets,Property Types,Min Price,Max Price,Conditions,Close Within Days,Active";
const parse = (...rows: string[]) =>
  parseLegacyCsv(Buffer.from([HEADER, ...rows].join("\r\n")), geo);

describe("parseLegacyCsv", () => {
  it("reads the sample file: 26 valid rows, 4 rejected with their reasons, one ignored column", () => {
    const { rows, ignoredColumns } = parseLegacyCsv(sample, geo);

    expect(rows.filter((row) => row.ok)).toHaveLength(26);
    expect(rows.flatMap((row) => (row.ok ? [] : [row.reason]))).toEqual([
      "row 7: Max Price (-5): Must be 0 or more",
      "row 12: Markets: ZIP 00000 is not a valid ZIP code",
      "row 19: Email is required",
      "row 24: Min Price (1400000): Min price must not be above max price",
    ]);
    expect(ignoredColumns).toEqual(["Source"]);
  });

  it("maps the old values to ours, with the defaults for blank cells", () => {
    const [row] = parse(
      'LEG-1,"Alamo, LLC",Al,AL@Example.com,(512) 555-0100,iBuyer,ALL,SFR;Multi,100000,250000,,,',
    ).rows;

    expect(row).toMatchObject({
      ok: true,
      investor: {
        externalRef: "LEG-1",
        companyName: "Alamo, LLC",
        email: "al@example.com",
        phone: "+15125550100",
        investorType: "IBUYER",
        status: "ACTIVE",
        proofOfFundsExpiresAt: null,
      },
      box: {
        name: "Legacy Import",
        geographyMode: "NATIONWIDE",
        geography: [],
        propertyTypes: ["SINGLE_FAMILY", "MULTI_FAMILY"],
        conditionsAccepted: null,
        closeWithinDays: 30,
      },
    });
  });

  it("rejects a row that mixes states and ZIP codes", () => {
    const [row] = parse("LEG-2,Bo,Bo,bo@example.com,,Wholesaler,TX;78704,SFR,1,2,,,").rows;
    expect(row).toEqual({
      rowNumber: 2,
      ok: false,
      reason: "row 2: Markets mixes states and ZIP codes",
    });
  });

  it("numbers each row as the spreadsheet does, counting a blank row it skips (T393)", () => {
    const { rows } = parse(
      "LEG-1,Al,Al,al@example.com,,Wholesaler,TX,SFR,1,2,,,",
      "",
      "LEG-2,Bo,Bo,bo@example.com,,Wholesaler,TX;78704,SFR,1,2,,,",
    );
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 4]);
    expect(rows[1]).toMatchObject({ reason: "row 4: Markets mixes states and ZIP codes" });
  });

  it("refuses a file without a required column", () => {
    const file = Buffer.from("Company,Email\nAlamo,al@example.com\n");
    expect(() => parseLegacyCsv(file, geo)).toThrow(FileRefusedError);
  });
});
