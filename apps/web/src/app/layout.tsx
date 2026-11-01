// Root layout (T327; constitution X): resolves the brand once per request, writes its tokens as CSS
// custom properties that the theme's utilities read, loads its font, and passes its content to
// client components through BrandProvider. Rendering per request (connection()) reads the settings
// at runtime, never during `next build`, and leaves room for brand resolution by host (T094).
import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { BrandProvider } from "@/brand/BrandProvider";
import { loadBrand } from "@/brand/brands";
import { brandFont } from "@/brand/fonts";
import { toCssRule } from "@/brand/tokens";
import { serverEnv } from "@/env";
import { Providers } from "@/providers";
import "./globals.css";

async function activeBrand() {
  await connection();
  return loadBrand(serverEnv().DEFAULT_BRAND_ID);
}

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await activeBrand();
  return {
    title: `${content.displayName} · ${content.productName}`,
    icons: { icon: content.logoPath },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const brand = await activeBrand();
  const font = brandFont(brand.fontFamily);
  const variables = font.stack
    ? { ...brand.variables, "--brand-font-family-base": font.stack }
    : brand.variables;

  return (
    <html lang="en" data-brand={brand.id} className={font.className}>
      <head>
        {/* Generated from the brand's checked token file (tokens.ts refuses unsafe values). */}
        <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: toCssRule(variables) }} />
      </head>
      <body className="bg-page font-body text-body text-default antialiased">
        <BrandProvider content={brand.content}>
          <Providers>{children}</Providers>
        </BrandProvider>
      </body>
    </html>
  );
}
