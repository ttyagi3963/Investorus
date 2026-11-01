// The agent area's layout (T266, T315): a header with the notification inbox (offers closing, a
// counter answered, a backup's reply) and sign out around every /agent page. proxy.ts has already
// sent visitors without a session to /login.
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { NotificationInbox } from "@/features/notifications/NotificationInbox";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between gap-inline-md border-b border-default bg-card p-inset-md">
        <Link href="/agent" className="font-heading text-heading-sm">
          Your listing packages
        </Link>
        <div className="flex items-center gap-inline-md">
          <NotificationInbox packagesPath="/agent/packages" />
          <SignOutButton />
        </div>
      </header>
      <main className="p-inset-lg">{children}</main>
    </>
  );
}
