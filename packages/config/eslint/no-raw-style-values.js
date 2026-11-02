// Style guard for apps/web and packages/ui (FR-091, SC-014; Constitution X, XVI).
// Screens and components may only use semantic utilities (bg-action-primary, p-inset-md, ...).
// Brand values live in seed/brands/*.json, never in source.

const HEX_LONG = /(?<![\w/&#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![\w-])/;
// 3/4-digit forms only count when they contain a hex letter, so copy like "Offer #123" passes.
const HEX_SHORT = /(?<![\w/&#-])#(?=[0-9]*[a-fA-F])[0-9a-fA-F]{3,4}(?![\w-])/;
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i;
const ARBITRARY_VALUE = /(?:^|[\s:])!?-?[a-z][a-z0-9-]*-\[[^\]\s]+\]/;
const ARBITRARY_PROPERTY = /(?:^|[\s:])\[[a-z-]+:[^\]]+\]/;
const PALETTE_HUES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PALETTE_UTILITIES =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|divide|from|via|to|fill|stroke|shadow|accent|caret|decoration|placeholder";
const DEFAULT_PALETTE = new RegExp(
  `(?:^|[\\s:])!?-?(?:${PALETTE_UTILITIES})-(?:(?:${PALETTE_HUES})-(?:50|[1-9]00|950)|black|white)(?:\\/\\d{1,3})?(?=$|\\s)`,
);
const CSS_UNIT = /\d(?:px|rem|em|pt|vh|vw|ch)\b/;
// React treats these style numbers as unitless, so they are not raw sizes.
const UNITLESS_STYLE_PROPS = new Set([
  "opacity",
  "zIndex",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
  "fontWeight",
  "lineHeight",
]);

function firstMatch(text) {
  for (const [messageId, pattern] of [
    ["arbitrary", ARBITRARY_VALUE],
    ["arbitrary", ARBITRARY_PROPERTY],
    ["hex", HEX_LONG],
    ["hex", HEX_SHORT],
    ["colorFunction", COLOR_FUNCTION],
    ["palette", DEFAULT_PALETTE],
  ]) {
    const match = pattern.exec(text);
    if (match) return { messageId, value: match[0].trim() };
  }
  return null;
}

function propertyName(property) {
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export const noRawStyleValues = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow raw colors, sizes, and default palette classes; use semantic tokens.",
    },
    schema: [],
    messages: {
      hex: "Raw hex color '{{value}}'. Use a semantic token utility (e.g. bg-action-primary).",
      colorFunction: "Raw color function '{{value}}'. Use a semantic token utility.",
      arbitrary: "Tailwind arbitrary value '{{value}}'. Use a semantic token utility instead.",
      palette: "Default palette class '{{value}}'. Use a semantic token utility instead.",
      inlineUnit: "Raw size '{{value}}' in an inline style. Use a semantic spacing/size utility.",
    },
  },
  create(context) {
    function check(node, text) {
      if (typeof text !== "string" || text.length === 0) return;
      const found = firstMatch(text);
      if (found) context.report({ node, messageId: found.messageId, data: { value: found.value } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      JSXAttribute(node) {
        if (node.name.name !== "style") return;
        const expression =
          node.value?.type === "JSXExpressionContainer" ? node.value.expression : null;
        if (expression?.type !== "ObjectExpression") return;
        for (const property of expression.properties) {
          if (property.type !== "Property" || property.value.type !== "Literal") continue;
          const { value } = property.value;
          const name = propertyName(property);
          if (typeof value === "number" && value !== 0 && !UNITLESS_STYLE_PROPS.has(name)) {
            context.report({
              node: property.value,
              messageId: "inlineUnit",
              data: { value: String(value) },
            });
          } else if (typeof value === "string" && CSS_UNIT.test(value)) {
            context.report({ node: property.value, messageId: "inlineUnit", data: { value } });
          }
        }
      },
    };
  },
};

export const stylePlugin = { rules: { "no-raw-style-values": noRawStyleValues } };

/** Flat-config entries that apply the rule to UI source (tests are exempt). */
export const styleConfigs = [
  {
    files: ["apps/web/src/**/*.{ts,tsx,js,jsx}", "packages/ui/src/**/*.{ts,tsx,js,jsx}"],
    ignores: ["**/*.test.{ts,tsx,js,jsx}"],
    plugins: { clever: stylePlugin },
    rules: { "clever/no-raw-style-values": "error" },
  },
];
