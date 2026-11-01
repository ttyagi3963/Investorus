// The buy box input (T320; FR-060, constitution XIX.3): composed from the registry, so the editor,
// the service, and the legacy import check the same rules. Each criterion is blank (null) for "any"
// (FR-025); a refusal names its field. Whether a ZIP code exists needs the ZIP lookup, so the
// service checks that.
import { z } from "zod";
import { BUY_BOX_STATUSES, BUY_BOX_STRATEGIES } from "./buy-box.js";
import {
  CRITERIA,
  CRITERION_KEYS,
  type CriterionDefinition,
  type CriterionKey,
} from "./criteria.js";

type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (
  i: infer I,
) => void
  ? I
  : never;
type CriteriaShape = UnionToIntersection<(typeof CRITERIA)[CriterionKey]["fields"]>;

const criteriaShape = Object.assign(
  {},
  ...CRITERION_KEYS.map((key) => CRITERIA[key].fields),
) as CriteriaShape;

export const buyBoxInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(60, "Use 60 characters or fewer"),
    /** A label for organizing; not a criterion. */
    strategy: z.enum(BUY_BOX_STRATEGIES).nullable(),
    status: z.enum(BUY_BOX_STATUSES),
    ...criteriaShape,
  })
  .superRefine((box, ctx) => {
    for (const key of CRITERION_KEYS) {
      const issue = (CRITERIA[key] as CriterionDefinition).check?.(box);
      if (issue) ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
  });
export type BuyBoxInput = z.infer<typeof buyBoxInputSchema>;

/** PUT /investor/buy-boxes/:id: the whole box again, naming the version the investor read. */
export const updateBuyBoxInputSchema = buyBoxInputSchema.and(
  z.object({ version: z.number().int().positive() }),
);
