// The agent area's layout (T266, T315, T327, T358): the brand header with the agent's pages, the
// notification inbox (offers closing, a counter answered, a backup's reply), the user's name, and
// sign out, around every /agent page. proxy.ts has already sent visitors without a session to
// /login, and other roles to their own home.
import type { ReactNode } from "react";
import { CurrentUser } from "@/features/auth/CurrentUser";
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
        <CurrentUser />
        <SignOutButton />
      </AppHeader>
      <main className={PAGE_MAIN}>{children}</main>
    </>
  );
}
