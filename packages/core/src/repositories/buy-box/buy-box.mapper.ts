// Maps a database BuyBox row and its geography rows to the domain type, the only place the row
// types appear (constitution IV): baths turn from decimals into numbers, and a list criterion that
// is NULL ("any") becomes null. The CHECKs forbid empty lists, so an empty one also means "any".
import type { BuyBox } from "@clever/contracts/buy-box";
import type {
  BuyBox as BuyBoxRow,
  BuyBoxGeography as BuyBoxGeographyRow,
} from "../../generated/prisma/client.js";

const listOrAny = <T>(list: T[] | null): T[] | null => (list && list.length > 0 ? list : null);
const toNumber = (value: { toNumber(): number } | null) =>
  value === null ? null : value.toNumber();

export function toBuyBox(row: BuyBoxRow & { geography: BuyBoxGeographyRow[] }): BuyBox {
  const kind = row.geographyMode === "STATES" ? "STATE" : "ZIP";
  return {
    id: row.id,
    investorId: row.investorId,
    name: row.name,
    status: row.status,
    isDefault: row.isDefault,
    strategy: row.strategy,
    geographyMode: row.geographyMode,
    geography:
      row.geographyMode === "NATIONWIDE"
        ? []
        : row.geography.filter((g) => g.kind === kind).map((g) => g.value),
    propertyTypes: listOrAny(row.propertyTypes),
    priceMin: row.priceMin,
    priceMax: row.priceMax,
    yearBuiltMin: row.yearBuiltMin,
    yearBuiltMax: row.yearBuiltMax,
    bedsMin: row.bedsMin,
    bedsMax: row.bedsMax,
    bathsMin: toNumber(row.bathsMin),
    bathsMax: toNumber(row.bathsMax),
    sqftMin: row.sqftMin,
    sqftMax: row.sqftMax,
    unitsMin: row.unitsMin,
    unitsMax: row.unitsMax,
    conditionsAccepted: listOrAny(row.conditionsAccepted),
    repairMax: row.repairMax,
    closeWithinDays: row.closeWithinDays,
    acceptsListed: row.acceptsListed,
    programsAccepted: listOrAny(row.programsAccepted),
    version: row.version,
  };
}
