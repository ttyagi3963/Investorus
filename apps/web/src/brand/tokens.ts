// Turns a brand's design tokens (W3C DTCG format, seed/brands/<id>/tokens.json) into CSS custom
// properties named --brand-<path>, which styles/theme.css maps onto the Tailwind utilities (T327;
// contracts/design-tokens.md). An alias such as {color.blue.700} becomes var(--brand-color-blue-700),
// so the browser keeps the semantic layer's references. Values are checked, because the result is
// written into the page's <style> element.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type TokenGroup = { [key: string]: Json };

const ALIAS = /^\{([\w.-]+)\}$/;
/** Characters that could end a declaration, a rule, or the style element itself. */
const UNSAFE = /[<>;{}\\]/;
const TYPOGRAPHY_PARTS = {
  fontFamily: "font-family",
  fontSize: "font-size",
  fontWeight: "font-weight",
  lineHeight: "line-height",
  letterSpacing: "letter-spacing",
} as const;

const variableOf = (path: string) => `--brand-${path.replaceAll(".", "-")}`;
const isGroup = (value: Json): value is TokenGroup =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every alias seen, as [token, target] dotted paths, so a dangling one can be named. */
type Aliases = [string, string][];

function scalar(path: string, value: Json, aliases: Aliases): string {
  if (typeof value === "string") {
    const alias = ALIAS.exec(value);
    if (alias) {
      aliases.push([path, alias[1]!]);
      return `var(${variableOf(alias[1]!)})`;
    }
    if (UNSAFE.test(value)) throw new Error(`Token ${path} has an unsafe value`);
    return value;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((family) => {
        const name = scalar(path, family, aliases);
        return /\s/.test(name) ? `"${name}"` : name;
      })
      .join(", ");
  }
  if (isGroup(value) && typeof value.value === "number" && typeof value.unit === "string") {
    return `${value.value}${scalar(path, value.unit, aliases)}`;
  }
  throw new Error(`Token ${path} has a value this converter does not know`);
}

function shadow(path: string, value: TokenGroup, aliases: Aliases): string {
  const { offsetX, offsetY, blur, spread, color } = value;
  return [offsetX, offsetY, blur, spread, color]
    .map((part) => scalar(path, part ?? null, aliases))
    .join(" ");
}

/** The brand's tokens as CSS custom properties, every alias checked to point at a token. */
export function toCssVariables(tokens: TokenGroup): Record<string, string> {
  const variables: Record<string, string> = {};
  const aliases: Aliases = [];

  const visit = (group: TokenGroup, path: string[], inheritedType: string | undefined) => {
    const type = typeof group.$type === "string" ? group.$type : inheritedType;
    for (const [key, child] of Object.entries(group)) {
      if (key.startsWith("$") || !isGroup(child)) continue;
      const childPath = [...path, key];
      if (!("$value" in child)) {
        visit(child, childPath, type);
        continue;
      }
      const name = childPath.join(".");
      const value = child.$value as Json;
      const childType = typeof child.$type === "string" ? child.$type : type;
      if (childType === "typography") {
        const target = isGroup(value) ? null : ALIAS.exec(String(value))?.[1];
        if (!isGroup(value) && !target) throw new Error(`Token ${name} is not a typography value`);
        for (const [part, suffix] of Object.entries(TYPOGRAPHY_PARTS)) {
          variables[variableOf(`${name}.${suffix}`)] = isGroup(value)
            ? scalar(name, value[part] ?? null, aliases)
            : scalar(name, `{${target}.${suffix}}`, aliases);
        }
      } else if (childType === "shadow" && isGroup(value)) {
        variables[variableOf(name)] = shadow(name, value, aliases);
      } else {
        variables[variableOf(name)] = scalar(name, value, aliases);
      }
    }
  };
  visit(tokens, [], undefined);

  for (const [token, target] of aliases) {
    if (!(variableOf(target) in variables)) {
      throw new Error(`Token ${token} points at ${target}, which does not exist`);
    }
  }
  return variables;
}

/** The variables as one :root rule for the page's <style> element. */
export function toCssRule(variables: Record<string, string>): string {
  const declarations = Object.entries(variables).map(([name, value]) => `${name}:${value}`);
  return `:root{${declarations.join(";")}}`;
}
