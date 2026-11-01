"use client";
// The signed-out brand panel (T329): the brand's logo, name, product, headline, intro, and numbered
// steps on the inverse background, beside the sign-in card. Every word comes from the brand's content.
import { useBrand } from "@/brand/BrandProvider";

export function BrandPanel() {
  const brand = useBrand();
  return (
    <section
      aria-label={brand.displayName}
      className="flex flex-col justify-between gap-stack-xl bg-inverse p-inset-xl text-inverse lg:min-h-screen lg:p-inset-2xl"
    >
      <div className="flex items-center gap-inline-md">
        <img src={brand.logoPath} alt="" width={36} height={36} className="size-9" />
        <div className="flex flex-col">
          <span className="font-heading text-heading-xs font-semibold">{brand.displayName}</span>
          <span className="text-helper text-inverse-muted">{brand.productName}</span>
        </div>
      </div>

      <div className="flex max-w-xl flex-col gap-stack-lg">
        <h1 className="font-heading text-display">{brand.signIn.headline}</h1>
        <p className="text-body-lg text-inverse-muted">{brand.signIn.intro}</p>
        <ol className="flex flex-col gap-stack-md">
          {brand.signIn.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-inline-md">
              {/* The list already numbers the steps for screen readers. */}
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-action-primary text-helper font-semibold text-on-primary"
              >
                {index + 1}
              </span>
              <span className="text-body">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-caption text-inverse-muted">Prototype for evaluation. Sample data only.</p>
    </section>
  );
}
