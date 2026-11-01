// The living style guide (T352; FR-094): the active brand's semantic colors with their values, its
// type scale, spacing, shapes, and every component in each state. Open to everyone, like the
// sign-in page, so a partner can review its brand before anyone has an account; the switcher shows
// each brand in turn.
import Link from "next/link";
import type { ReactNode } from "react";
import { activeBrand } from "@/brand/active-brand";
import { BrandSwitcher } from "@/brand/BrandSwitcher";
import { semanticColors, spacingScale } from "@/features/design-system/brand-variables";
import { ComponentGallery } from "@/features/design-system/ComponentGallery";

export const metadata = { title: "Design system" };

const TYPE_SCALE = [
  { className: "text-display", name: "Display" },
  { className: "text-heading-lg", name: "Heading large" },
  { className: "text-heading-md", name: "Heading medium" },
  { className: "text-heading-sm", name: "Heading small" },
  { className: "text-heading-xs", name: "Heading extra small" },
  { className: "text-body-lg", name: "Body large" },
  { className: "text-body", name: "Body" },
  { className: "text-label", name: "Label" },
  { className: "text-helper", name: "Helper" },
  { className: "text-caption", name: "Caption" },
];

const SHAPES = [
  { className: "rounded-control shadow-control", name: "Control corner, control shadow" },
  { className: "rounded-button", name: "Button corner" },
  { className: "rounded-card shadow-card", name: "Card corner, card shadow" },
  { className: "rounded-pill", name: "Pill" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-stack-lg">
      <h2 className="font-heading text-heading-md text-heading">{title}</h2>
      {children}
    </section>
  );
}

export default async function DesignSystemPage() {
  const brand = await activeBrand();
  const variables = brand.cssVariables;

  return (
    <main className="mx-auto flex max-w-content flex-col gap-stack-xl px-page-x py-inset-xl">
      <header className="flex flex-wrap items-end justify-between gap-stack-lg">
        <div className="flex flex-col gap-stack-xs">
          <Link href="/" className="text-body text-link hover:text-link-hover">
            {brand.content.displayName}
          </Link>
          <h1 className="font-heading text-display text-heading">Design system</h1>
          <p className="text-body text-muted">
            Version {brand.tokenVersion} of the {brand.content.displayName} tokens.
          </p>
        </div>
        <div className="w-72">
          <BrandSwitcher />
        </div>
      </header>

      <Section title="Colors">
        {semanticColors(variables).map(([role, swatches]) => (
          <div key={role} className="flex flex-col gap-stack-sm">
            <h3 className="font-heading text-heading-xs capitalize text-heading">{role}</h3>
            <ul className="grid grid-cols-2 gap-stack-md sm:grid-cols-3 lg:grid-cols-4">
              {swatches.map((s) => (
                <li key={s.name} className="flex items-center gap-inline-md">
                  <span
                    aria-hidden="true"
                    className="size-10 shrink-0 rounded-control border border-default"
                    style={{ background: `var(${s.name})` }}
                  />
                  <span className="flex flex-col">
                    <span className="text-label text-default">{s.label}</span>
                    <code className="text-caption text-muted">{s.value}</code>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Type">
        <ul className="flex flex-col gap-stack-md">
          {TYPE_SCALE.map((t) => (
            <li key={t.className} className="flex flex-col gap-stack-xs">
              <span className={`${t.className} font-heading text-default`}>{t.name}</span>
              <code className="text-caption text-muted">{t.className}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Spacing">
        <ul className="flex flex-col gap-stack-sm">
          {spacingScale(variables).map((s) => (
            <li key={s.name} className="flex items-center gap-inline-md">
              <code className="w-16 text-caption text-muted">{s.value}</code>
              <span
                aria-hidden="true"
                className="h-4 rounded-control bg-action-primary"
                style={{ width: `var(${s.name})` }}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shape and elevation">
        <ul className="flex flex-wrap gap-inline-lg">
          {SHAPES.map((s) => (
            <li key={s.name} className="flex flex-col items-center gap-stack-sm">
              <span
                aria-hidden="true"
                className={`${s.className} size-24 border border-default bg-card`}
              />
              <span className="text-helper text-muted">{s.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Components">
        <ComponentGallery />
      </Section>
    </main>
  );
}
