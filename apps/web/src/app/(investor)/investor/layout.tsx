// The investor area's layout (T300): a header with the notification inbox and sign out around every
// /investor page. proxy.ts has already sent visitors without a session to /login.
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { NotificationInbox } from "@/features/notifications/NotificationInbox";

export default function InvestorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between gap-inline-md border-b border-default bg-card p-inset-md">
        <Link href="/investor" className="font-heading text-heading-sm">
          Your matched listings
        </Link>
        <div className="flex items-center gap-inline-md">
          <NotificationInbox packagesPath="/investor/packages" />
          <SignOutButton />
        </div>
      </header>
      <main className="p-inset-lg">{children}</main>
    </>
  );
}
