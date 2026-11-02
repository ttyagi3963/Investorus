// Keeps a list criterion's mode and its chips in step (T371): a checked chip means "only the ones
// checked", so checking one while the mode says "any" switches the mode instead of the chip being
// silently dropped on save; choosing "any" clears the chips.
import { ANY, ONLY } from "./read-form";

export type ChoiceState = { mode: typeof ANY | typeof ONLY; picked: string[] };

/** The chips were changed: any checked chip makes the mode "only these". */
export function pickChoices(state: ChoiceState, picked: string[]): ChoiceState {
  return { mode: picked.length > 0 ? ONLY : state.mode, picked };
}

/** The mode was changed: "any" leaves nothing checked. */
export function chooseMode(state: ChoiceState, mode: ChoiceState["mode"]): ChoiceState {
  return { mode, picked: mode === ANY ? [] : state.picked };
}
