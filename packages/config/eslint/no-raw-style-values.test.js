import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noRawStyleValues } from "./no-raw-style-values.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run("no-raw-style-values", noRawStyleValues, {
  valid: [
    // Semantic utilities only (FR-091, SC-014).
    { code: `<button className="bg-action-primary text-on-primary p-inset-md rounded-control" />` },
    { code: `const cls = "text-muted border-strong shadow-card";` },
    { code: "const cls = `gap-stack-md ${active ? 'bg-status-info-surface' : ''}`;" },
    // CSS variables and percentages are allowed in inline styles.
    { code: `<div style={{ color: "var(--color-text-default)", width: "40%" }} />` },
    // Anchors and IDs are not colors.
    { code: `const href = "/design-system#tokens";` },
    { code: `const label = "Offer #12 received";` },
    // Breakpoint/state variants with semantic utilities.
    { code: `const cls = "md:p-inset-lg hover:bg-action-primary-hover";` },
  ],
  invalid: [
    { code: `const c = "#0052FF";`, errors: [{ messageId: "hex" }] },
    { code: `const c = "#fff";`, errors: [{ messageId: "hex" }] },
    { code: `const c = "rgb(0, 82, 255)";`, errors: [{ messageId: "colorFunction" }] },
    { code: `const c = "oklch(0.6 0.2 260)";`, errors: [{ messageId: "colorFunction" }] },
    { code: `<div className="bg-[#0052FF]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="p-[13px] text-muted" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="[color:red]" />`, errors: [{ messageId: "arbitrary" }] },
    { code: `<div className="bg-blue-500" />`, errors: [{ messageId: "palette" }] },
    { code: `<div className="hover:text-gray-700" />`, errors: [{ messageId: "palette" }] },
    { code: `<div className="bg-white/80" />`, errors: [{ messageId: "palette" }] },
    { code: "const cls = `p-inset-md ${x} border-slate-200`;", errors: [{ messageId: "palette" }] },
    { code: `<div style={{ padding: "13px" }} />`, errors: [{ messageId: "inlineUnit" }] },
    { code: `<div style={{ margin: 8 }} />`, errors: [{ messageId: "inlineUnit" }] },
  ],
});
