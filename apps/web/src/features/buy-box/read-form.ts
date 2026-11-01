// Reads the buy box editor into the api's input (T324), walking the registry's form metadata so a
// new criterion is read too. A blank number or a list left at "any" is null; a list set to "only
// these" with nothing checked is an empty list, which the api refuses with "leave it blank for any".
import {
  CRITERIA,
  CRITERION_KEYS,
  type BuyBoxInput,
  type CriterionDefinition,
} from "@clever/contracts/buy-box";

export const NO_STRATEGY = "NONE";
export const ANY = "any";
export const ONLY = "only";
export const LISTED = "yes";

export function readForm(form: FormData, status: BuyBoxInput["status"]): BuyBoxInput {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const num = (name: string) => (text(name) === "" ? null : Number(text(name)));
  const box: Record<string, unknown> = {
    name: text("name"),
    strategy: text("strategy") === NO_STRATEGY ? null : text("strategy"),
    status,
  };
  for (const key of CRITERION_KEYS) {
    const field = (CRITERIA[key] as CriterionDefinition).form;
    switch (field.kind) {
      case "geography":
        box.geographyMode = text("geographyMode");
        box.geography = text("geography")
          .split(/[\s,;]+/)
          .filter((place) => place !== "");
        break;
      case "range":
        box[field.min] = num(field.min);
        box[field.max] = num(field.max);
        break;
      case "limit":
        box[field.field] = num(field.field);
        break;
      case "choices":
        box[field.field] =
          text(`${field.field}.mode`) === ONLY ? form.getAll(field.field).map(String) : null;
        break;
      case "toggle":
        box[field.field] = form.getAll(field.field).includes(LISTED);
        break;
    }
  }
  return box as BuyBoxInput;
}
