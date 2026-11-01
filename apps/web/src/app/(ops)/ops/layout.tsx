// The operations area's layout (T325, T327): the dark console header with its pages and sign out,
// around every /ops page. proxy.ts has already sent visitors without a session to /login; the api
// checks the role.
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { AppHeader } from "@/features/shell/AppHeader";
import { PAGE_MAIN } from "@/features/shell/styles";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        areaLabel="Operations"
        tone="inverse"
        nav={[{ href: "/ops/imports", label: "Investor imports" }]}
      >
        <SignOutButton />
      </AppHeader>
      <main className={PAGE_MAIN}>{children}</main>
    </>
  );
}
