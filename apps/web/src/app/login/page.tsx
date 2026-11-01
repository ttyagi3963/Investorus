"use client";
// The login page (T104, T300): pre-filled with the demo agent, and a list of every demo account the
// migrate step seeds (packages/core/src/infra/seed/seed.ts), so the reviewer can switch roles with
// one press and sign in through the real session flow.
import { Button, TextField } from "@clever/ui";
import { useState, type FormEvent } from "react";
import { useLogin } from "@/features/auth/useLogin";
import { ErrorNotice } from "@/features/errors/ErrorNotice";

const DEMO_PASSWORD = "demo1234";
const DEMO_ACCOUNTS = [
  { email: "avery@example.com", role: "Agent", shows: "builds and publishes listing packages" },
  { email: "summit@example.com", role: "Investor", shows: "two buy boxes that match the sample" },
  { email: "harbor@example.com", role: "Investor", shows: "one broad buy box" },
  { email: "ridge@example.com", role: "Investor", shows: "a narrow buy box that does not match" },
] as const;

export default function LoginPage() {
  const { submit, isPending, error } = useLogin();
  const [email, setEmail] = useState<string>(DEMO_ACCOUNTS[0].email);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-stack-lg p-inset-lg">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
      >
        <h1 className="font-heading text-heading-md">Sign in</h1>
        <p className="text-label text-muted">A demo account&apos;s details are filled in.</p>
        {/* The key remounts the fields, so choosing a demo account fills them in. */}
        <div key={email} className="flex flex-col gap-stack-md">
          <TextField
            name="email"
            type="email"
            label="Email"
            autoComplete="username"
            defaultValue={email}
            isRequired
          />
          <TextField
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            defaultValue={DEMO_PASSWORD}
            isRequired
          />
        </div>
        {error && <ErrorNotice error={error} />}
        <Button type="submit" isPending={isPending}>
          Sign in
        </Button>
      </form>

      <section
        aria-labelledby="demo-accounts"
        className="flex w-full max-w-sm flex-col gap-stack-sm rounded-card bg-card p-inset-lg shadow-card"
      >
        <h2 id="demo-accounts" className="font-heading text-heading-sm">
          Demo accounts
        </h2>
        <p className="text-label text-muted">Every account uses the password {DEMO_PASSWORD}.</p>
        <ul className="flex flex-col gap-stack-sm">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-stack-sm">
              <span className="text-label">
                <strong>{account.role}</strong> {account.email}: {account.shows}
              </span>
              <Button
                variant="secondary"
                onPress={() => setEmail(account.email)}
                aria-label={`Use ${account.email}`}
              >
                Use
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
