// The operations area's layout (T325, T327, T342, T358): the dark console header with its pages
// (packages, failed jobs, outages, the CRM, imports, and brands), the user's name, and sign out,
// around every /ops page. proxy.ts has already sent visitors without a session to /login, and
// other roles to their own home; the api checks the role.
import type { ReactNode } from "react";
import { CurrentUser } from "@/features/auth/CurrentUser";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { AppHeader } from "@/features/shell/AppHeader";
import { PAGE_MAIN } from "@/features/shell/styles";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        areaLabel="Operations"
        tone="inverse"
        nav={[
          { href: "/ops/packages", label: "Packages" },
          { href: "/ops/deliveries", label: "Failed jobs" },
          { href: "/ops/simulations", label: "Simulations" },
          { href: "/ops/crm", label: "CRM" },
          { href: "/ops/imports", label: "Investor imports" },
          { href: "/ops/brands", label: "Brands" },
        ]}
      >
        <CurrentUser tone="inverse" />
        <SignOutButton />
      </AppHeader>
      <main className={PAGE_MAIN}>{children}</main>
    </>
  );
}
