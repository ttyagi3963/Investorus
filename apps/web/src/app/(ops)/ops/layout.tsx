// The operations area's layout (T325): a header with its pages and sign out around every /ops page.
// proxy.ts has already sent visitors without a session to /login; the api checks the role.
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="flex items-center justify-between gap-inline-md border-b border-default bg-card p-inset-md">
        <span className="font-heading text-heading-sm">Operations</span>
        <nav aria-label="Operations" className="flex items-center gap-inline-md">
          <Link href="/ops/imports" className="text-label text-link underline">
            Import investors
          </Link>
          <SignOutButton />
        </nav>
      </header>
      <main className="p-inset-lg">{children}</main>
    </>
  );
}
