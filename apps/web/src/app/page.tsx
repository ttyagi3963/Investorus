// Home page placeholder with the way in (sign in); replaced by the demo explainer in T103.
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-stack-md p-inset-lg">
      <h1 className="font-heading text-heading-lg">Investor Platform prototype</h1>
      <Link href="/login" className="text-link underline">
        Sign in
      </Link>
    </main>
  );
}
