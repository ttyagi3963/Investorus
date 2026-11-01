// Root layout: loads the global styles and sets the page's base colors and type from the semantic
// tokens. Brand resolution and its CSS variables are added in T094.
import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-default font-body text-body">{children}</body>
    </html>
  );
}
