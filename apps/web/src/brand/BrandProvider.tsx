"use client";
// Hands the active brand's content (name, logo, sign-in copy) to client components (T327;
// constitution X: the brand is resolved once in the root layout and passed down through context).
import { createContext, use, type ReactNode } from "react";
import type { BrandContent } from "./brands";

const BrandContext = createContext<BrandContent | null>(null);

export function BrandProvider({ content, children }: { content: BrandContent; children: ReactNode }) {
  return <BrandContext value={content}>{children}</BrandContext>;
}

export function useBrand(): BrandContent {
  const content = use(BrandContext);
  if (!content) throw new Error("useBrand must be used inside BrandProvider");
  return content;
}
