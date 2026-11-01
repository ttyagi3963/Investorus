"use client";
// The login page (T104): pre-filled with the demo agent the migrate step seeds
// (packages/core/src/infra/seed/seed.ts), so the reviewer signs in with one press through the
// real session flow.
import { Button, TextField } from "@clever/ui";
import type { FormEvent } from "react";
import { useLogin } from "@/features/auth/useLogin";

const DEMO_AGENT = { email: "avery@example.com", password: "demo1234" };

export default function LoginPage() {
  const { submit, isPending, error } = useLogin();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submit({ email: String(form.get("email")), password: String(form.get("password")) });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-inset-lg">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
      >
        <h1 className="font-heading text-heading-md">Sign in</h1>
        <p className="text-label text-muted">The demo agent&apos;s details are filled in.</p>
        <TextField
          name="email"
          type="email"
          label="Email"
          autoComplete="username"
          defaultValue={DEMO_AGENT.email}
          isRequired
        />
        <TextField
          name="password"
          type="password"
          label="Password"
          autoComplete="current-password"
          defaultValue={DEMO_AGENT.password}
          isRequired
        />
        {error && (
          <p
            role="alert"
            className="rounded-control bg-danger-surface p-inset-sm text-label text-danger"
          >
            {error}
          </p>
        )}
        <Button type="submit" isPending={isPending}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
