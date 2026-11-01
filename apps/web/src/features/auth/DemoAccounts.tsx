// The demo accounts under the sign-in card (T300, T329): every account the migrate step seeds
// (packages/core/src/infra/seed/seed.ts), one row each, so the reviewer can switch roles with one press.
import { Button } from "@clever/ui";

export const DEMO_PASSWORD = "demo1234";
export const DEMO_ACCOUNTS = [
  { email: "avery@example.com", role: "Agent", shows: "builds and publishes listing packages" },
  { email: "blake@example.com", role: "Agent", shows: "compares four offers and tracks the deal" },
  { email: "summit@example.com", role: "Investor", shows: "two buy boxes that match the sample" },
  { email: "harbor@example.com", role: "Investor", shows: "one broad buy box" },
  { email: "ridge@example.com", role: "Investor", shows: "a narrow buy box that does not match" },
  { email: "morgan@example.com", role: "Operations", shows: "imports the legacy investor list" },
] as const;

/** `onUse` fills the sign-in form with the chosen account. */
export function DemoAccounts({ onUse }: { onUse: (email: string) => void }) {
  return (
    <section aria-labelledby="demo-accounts" className="flex flex-col gap-stack-sm">
      <h2 id="demo-accounts" className="text-label text-muted">
        Demo accounts
      </h2>
      <p className="text-helper text-muted">
        Every account uses the password {DEMO_PASSWORD}. Choosing one fills in the form.
      </p>
      <ul className="flex flex-col gap-stack-sm">
        {DEMO_ACCOUNTS.map((account) => (
          <li
            key={account.email}
            className="flex items-center justify-between gap-inline-md rounded-control border border-default bg-card px-inset-md py-inset-sm"
          >
            <span className="flex flex-col">
              <span className="text-body font-semibold text-heading">{account.role}</span>
              <span className="text-helper text-muted">
                {account.email}: {account.shows}
              </span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onPress={() => onUse(account.email)}
              aria-label={`Use ${account.email}`}
            >
              Use
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
