// Root layout: loads the global styles, sets the page's base colors and type from the semantic
// tokens, and wraps every page in the client providers. Brand resolution is added in T094.
import type { ReactNode } from "react";
import { Providers } from "@/providers";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-default font-body text-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
