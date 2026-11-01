"use client";
// The brand switcher (T351; FR-092): a select of the brands that saves the choice through a server
// action, which re-renders the page in the chosen brand. Hidden when there is only one brand.
import { Select } from "@clever/ui";
import { useTransition } from "react";
import { chooseBrand } from "./actions";
import { useBrand, useBrands } from "./BrandProvider";

export function BrandSwitcher() {
  const brands = useBrands();
  const { brandId } = useBrand();
  const [isPending, startTransition] = useTransition();
  if (brands.length < 2) return null;

  return (
    <Select
      label="Brand"
      options={brands.map((b) => ({ id: b.brandId, label: b.displayName }))}
      selectedKey={brandId}
      isDisabled={isPending}
      onSelectionChange={(key) => {
        if (key !== null) startTransition(() => chooseBrand(String(key)));
      }}
    />
  );
}
