"use client";
// Hands the active brand's content (name, logo, sign-in copy) and the brands a visitor can switch to
// to client components (T327, T351; constitution X: the brand is resolved once in the root layout
// and passed down through context).
import type { BrandContent, BrandSummary } from "@clever/contracts/brand";
import { createContext, use, type ReactNode } from "react";

type BrandContextValue = { content: BrandContent; brands: BrandSummary[] };

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({
  content,
  brands,
  children,
}: BrandContextValue & { children: ReactNode }) {
  return <BrandContext value={{ content, brands }}>{children}</BrandContext>;
}

function useBrandContext(): BrandContextValue {
  const value = use(BrandContext);
  if (!value) throw new Error("useBrand must be used inside BrandProvider");
  return value;
}

export function useBrand(): BrandContent {
  return useBrandContext().content;
}

/** The brands the switcher offers. */
export function useBrands(): BrandSummary[] {
  return useBrandContext().brands;
}
