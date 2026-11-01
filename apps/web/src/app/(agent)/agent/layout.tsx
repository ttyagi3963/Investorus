// The agent area's layout (T266): a header with sign out around every /agent page. proxy.ts has
// already sent visitors without a session to /login.
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-end border-b border-default bg-card p-inset-md">
        <SignOutButton />
      </header>
      <main className="p-inset-lg">{children}</main>
    </>
  );
}
