// Root layout (T327, T349; constitution X): resolves the request's brand once (cookie, host, or the
// default), writes its tokens as CSS custom properties that the theme's utilities read, loads its
// font, and passes its content to client components through BrandProvider. Reading the cookie and
// host renders every page per request, so the settings are read at runtime, never in `next build`.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { activeBrand, listBrands } from "@/brand/active-brand";
import { BrandProvider } from "@/brand/BrandProvider";
import { brandFont } from "@/brand/fonts";
import { toCssRule } from "@clever/contracts/brand";
import { Providers } from "@/providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await activeBrand();
  return {
    title: `${content.displayName} · ${content.productName}`,
    icons: { icon: content.logoPath },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [brand, brands] = await Promise.all([activeBrand(), listBrands()]);
  const font = brandFont(brand.fontFamily);
  const variables = font.stack
    ? { ...brand.cssVariables, "--brand-font-family-base": font.stack }
    : brand.cssVariables;

  return (
    <html lang="en" data-brand={brand.brandId} className={font.className}>
      <head>
        {/* The api serves only token sets its validator passed, which refuses unsafe values. */}
        <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: toCssRule(variables) }} />
      </head>
      <body className="bg-page font-body text-body text-default antialiased">
        <BrandProvider content={brand.content} brands={brands}>
          <Providers>{children}</Providers>
        </BrandProvider>
      </body>
    </html>
  );
}
