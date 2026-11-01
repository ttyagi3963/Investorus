"use client";
// The home page's content (T103, T356): the brand panel beside what the prototype lets a reviewer
// try (the deal loop, the outage demo, the brand switch), the demo accounts with one-press sign-in,
// and links to sign in, the sandbox, and the style guide. Words that name the brand come from the
// brand's content.
import { buttonClasses, Card } from "@clever/ui";
import Link from "next/link";
import { useBrand } from "@/brand/BrandProvider";
import { BrandSwitcher } from "@/brand/BrandSwitcher";
import { BrandPanel } from "@/features/auth/BrandPanel";
import { DEMO_PASSWORD, DemoAccounts } from "@/features/auth/DemoAccounts";
import { useLogin } from "@/features/auth/useLogin";
import { ErrorNotice } from "@/features/errors/ErrorNotice";

const LINK = "text-body text-link underline hover:text-link-hover";

export function HomeScreen({ sandboxUrl }: { sandboxUrl: string }) {
  const brand = useBrand();
  const { submit, isPending, error } = useLogin();

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-inset-lg py-inset-xl">
        <div className="flex w-full max-w-md flex-col gap-stack-lg">
          <Card
            title="What to try"
            description={`${brand.productName} is a working prototype with sample data.`}
            padding="xl"
          >
            <ol className="flex list-decimal flex-col gap-stack-sm pl-inset-lg text-body text-default">
              <li>
                The deal loop: an agent publishes a listing, matching investors are told and make
                offers, and the agent compares them, accepts one, and tracks the deal to closing.
              </li>
              <li>
                An outage: operations break the CRM or email under Simulations; nobody&apos;s work
                fails, and the messages go out once the service is back.
              </li>
              <li>
                Another brand: switch below, or open <code>partner.localhost:3000</code>, and the
                same screens run as a partner&apos;s, with no code change.
              </li>
            </ol>
            <Link href="/login" className={buttonClasses({ fullWidth: true })}>
              Sign in
            </Link>
            <p className="flex flex-wrap gap-inline-lg">
              <a href={sandboxUrl} className={LINK}>
                The sandbox (CRM, email, and texts)
              </a>
              <Link href="/design-system" className={LINK}>
                The style guide
              </Link>
            </p>
          </Card>
          {error && <ErrorNotice error={error} />}
          <DemoAccounts
            isPending={isPending}
            onSignIn={(email) => void submit({ email, password: DEMO_PASSWORD })}
          />
          <BrandSwitcher />
        </div>
      </div>
    </main>
  );
}
