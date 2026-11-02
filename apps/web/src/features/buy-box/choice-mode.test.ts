// Guards how a list criterion's mode and its chips stay in step (T371): checking a chip while the
// mode says "any" switches it to "only the ones checked", so a checked chip is never silently
// dropped; choosing "any" clears the chips, so the form never shows choices it will not send.
import { describe, expect, it } from "vitest";
import { chooseMode, pickChoices } from "./choice-mode";
import { ANY, ONLY } from "./read-form";

describe("list criterion mode", () => {
  it("switches to only-these when a chip is checked, and clears the chips when set to any", () => {
    const checked = pickChoices({ mode: ANY, picked: [] }, ["SINGLE_FAMILY"]);
    expect(checked).toEqual({ mode: ONLY, picked: ["SINGLE_FAMILY"] });

    expect(chooseMode(checked, ANY)).toEqual({ mode: ANY, picked: [] });
    // Unchecking every chip keeps "only these", so the api can refuse the empty list with a reason.
    expect(pickChoices(checked, [])).toEqual({ mode: ONLY, picked: [] });
  });
});
