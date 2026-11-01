"use client";
// The login page (T104, T300, T329, T357): the brand panel beside the sign-in card, pre-filled with
// the demo agent, and the demo accounts under it, each signing in with one press through the real
// session flow. The brand switcher sits last (T351).
import { Button, Card, TextField } from "@clever/ui";
import { useId, type FormEvent } from "react";
import { BrandSwitcher } from "@/brand/BrandSwitcher";
import { BrandPanel } from "@/features/auth/BrandPanel";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DemoAccounts } from "@/features/auth/DemoAccounts";
import { useLogin } from "@/features/auth/useLogin";
import { ErrorNotice } from "@/features/errors/ErrorNotice";

export default function LoginPage() {
  const { submit, isPending, error } = useLogin();
  const headingId = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-inset-lg py-inset-xl">
        <div className="flex w-full max-w-md flex-col gap-stack-lg">
          <Card padding="xl">
            <form
              aria-labelledby={headingId}
              onSubmit={onSubmit}
              className="flex flex-col gap-stack-lg"
            >
              <div className="flex flex-col gap-stack-xs">
                <h2 id={headingId} className="font-heading text-heading-lg text-heading">
                  Sign in
                </h2>
                <p className="text-body text-muted">
                  Agents, investors and operations use the same sign-in.
                </p>
              </div>
              <div className="flex flex-col gap-stack-md">
                <TextField
                  name="email"
                  type="email"
                  label="Email"
                  autoComplete="username"
                  defaultValue={DEMO_ACCOUNTS[0].email}
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
              <Button type="submit" isPending={isPending} fullWidth>
                Sign in
              </Button>
            </form>
          </Card>
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
