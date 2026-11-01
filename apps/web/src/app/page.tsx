"use client";
// Home page placeholder (T329): the brand panel and the way in (sign in); replaced by the demo
// explainer in T103. A client page: the @clever/ui barrel has no server-safe entry.
import { buttonClasses, Card } from "@clever/ui";
import Link from "next/link";
import { BrandPanel } from "@/features/auth/BrandPanel";

export default function HomePage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-inset-lg py-inset-xl">
        <div className="w-full max-w-md">
          <Card
            title="Try the prototype"
            description="Sign in with a demo account to see the agent, investor and operations views."
            padding="xl"
          >
            <Link href="/login" className={buttonClasses({ fullWidth: true })}>
              Sign in
            </Link>
          </Card>
        </div>
      </div>
    </main>
  );
}
