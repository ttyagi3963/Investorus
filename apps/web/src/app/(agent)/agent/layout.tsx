// The agent area's layout (T266, T315, T327): the brand header with the agent's pages, the
// notification inbox (offers closing, a counter answered, a backup's reply), and sign out, around
// every /agent page. proxy.ts has already sent visitors without a session to /login.
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { NotificationInbox } from "@/features/notifications/NotificationInbox";
import { AppHeader } from "@/features/shell/AppHeader";
import { PAGE_MAIN } from "@/features/shell/styles";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        areaLabel="Agent"
        nav={[{ href: "/agent", label: "Packages", alsoActiveUnder: ["/agent/packages"] }]}
      >
        <NotificationInbox packagesPath="/agent/packages" />
        <SignOutButton />
      </AppHeader>
      <main className={PAGE_MAIN}>{children}</main>
    </>
  );
}
