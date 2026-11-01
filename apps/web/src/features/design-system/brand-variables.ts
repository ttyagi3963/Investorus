// Reads the active brand's CSS variables for the style guide (T352): the semantic colors grouped by
// role, the spacing scale in order, and each alias followed to the value it ends at, so the guide
// shows "#0a6359", not "var(--brand-color-teal-700)".
const ALIAS = /^var\((--brand-[a-z0-9-]+)\)$/;
const COLOR_PREFIX = "--brand-semantic-color-";

/** The value a variable ends at after following its aliases. */
export function resolveValue(variables: Record<string, string>, name: string): string {
  let value = variables[name] ?? "";
  for (let depth = 0; depth < 10; depth += 1) {
    const alias = ALIAS.exec(value)?.[1];
    if (!alias || variables[alias] === undefined) break;
    value = variables[alias];
  }
  return value;
}

export type ColorSwatch = { name: string; label: string; value: string };

/** The semantic colors by role (text, background, border, action, status, feedback). */
export function semanticColors(variables: Record<string, string>): [string, ColorSwatch[]][] {
  const groups = new Map<string, ColorSwatch[]>();
  for (const name of Object.keys(variables).filter((n) => n.startsWith(COLOR_PREFIX))) {
    const [role = "", ...rest] = name.slice(COLOR_PREFIX.length).split("-");
    const group = groups.get(role) ?? [];
    group.push({ name, label: rest.join("-"), value: resolveValue(variables, name) });
    groups.set(role, group);
  }
  return [...groups];
}

/** The spacing steps, smallest first. */
export function spacingScale(variables: Record<string, string>): ColorSwatch[] {
  return Object.keys(variables)
    .filter((n) => /^--brand-space-\d+$/.test(n))
    .map((name) => ({ name, label: name.slice("--brand-space-".length), value: variables[name]! }))
    .sort((a, b) => Number(a.label) - Number(b.label));
}
