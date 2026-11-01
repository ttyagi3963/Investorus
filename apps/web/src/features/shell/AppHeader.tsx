"use client";
// The signed-in header (T327): the brand's logo, name, and product name, the area's pages as a
// navigation list with the current one marked (aria-current), and the area's controls on the right.
// The operations console uses the inverse (dark) header, as in the design.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useBrand } from "@/brand/BrandProvider";

export type NavItem = {
  href: string;
  label: string;
  /** Paths under another route that also belong to this page, such as a package under the list. */
  alsoActiveUnder?: string[];
};

export type AppHeaderProps = {
  /** Names the navigation landmark, for example "Agent". */
  areaLabel: string;
  nav: NavItem[];
  tone?: "light" | "inverse";
  children?: ReactNode;
};

const TONES = {
  light: {
    bar: "border-b border-default bg-card",
    name: "text-heading",
    product: "text-muted",
    link: "text-default hover:text-link",
    current: "border-selected text-link",
  },
  inverse: {
    bar: "bg-inverse",
    name: "text-inverse",
    product: "text-inverse-muted",
    link: "text-inverse-muted hover:text-inverse",
    current: "border-cta text-inverse",
  },
} as const;

function isCurrent(pathname: string, item: NavItem): boolean {
  return (
    pathname === item.href ||
    (item.alsoActiveUnder ?? [item.href]).some((prefix) => pathname.startsWith(`${prefix}/`))
  );
}

export function AppHeader({ areaLabel, nav, tone = "light", children }: AppHeaderProps) {
  const brand = useBrand();
  const pathname = usePathname();
  const styles = TONES[tone];
  const productName = tone === "inverse" ? brand.opsProductName : brand.productName;

  return (
    <header className={styles.bar}>
      <div className="mx-auto box-content flex min-h-header max-w-content flex-wrap items-center gap-inline-lg px-page-x">
        <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-inline-md rounded-control">
          <img src={brand.logoPath} alt="" width={32} height={32} className="size-8" />
          <span className={`font-heading text-heading-xs font-semibold ${styles.name}`}>
            {brand.displayName}
          </span>
          <span className={`text-helper ${styles.product}`}>{productName}</span>
        </Link>
        <nav aria-label={areaLabel} className="flex-1 self-stretch">
          <ul className="flex h-full items-stretch gap-inline-md">
            {nav.map((item) => {
              const current = isCurrent(pathname, item);
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center border-b-2 px-inset-md text-body-lg ${
                      current ? `${styles.current} font-semibold` : `border-transparent ${styles.link}`
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex items-center gap-inline-md">{children}</div>
      </div>
    </header>
  );
}
