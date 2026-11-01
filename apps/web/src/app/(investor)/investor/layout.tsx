// The investor area's layout (T300, T324, T327, T358): the brand header with the investor's pages
// (their matched listings and their buy boxes), the notification inbox, the user's name, and sign
// out, around every /investor page. proxy.ts has already sent visitors without a session to
// /login, and other roles to their own home.
import type { ReactNode } from "react";
import { CurrentUser } from "@/features/auth/CurrentUser";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { NotificationInbox } from "@/features/notifications/NotificationInbox";
import { AppHeader } from "@/features/shell/AppHeader";
import { PAGE_MAIN } from "@/features/shell/styles";

export default function InvestorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        areaLabel="Investor"
        nav={[
          { href: "/investor", label: "Opportunities", alsoActiveUnder: ["/investor/packages"] },
          { href: "/investor/buy-boxes", label: "Buy boxes" },
        ]}
      >
        <NotificationInbox packagesPath="/investor/packages" />
        <CurrentUser />
        <SignOutButton />
      </AppHeader>
      <main className={PAGE_MAIN}>{children}</main>
    </>
  );
}
