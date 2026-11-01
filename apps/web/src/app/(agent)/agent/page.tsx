"use client";
// The agent's dashboard (T269): their packages with address, status, price range, and photo count,
// each linking to its edit page, plus loading, error, and empty states and a "New package" link.
import Link from "next/link";
import { usePackages } from "@/features/listing-package/queries";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const statusLabel = (status: string) =>
  status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
const LINK_BUTTON =
  "rounded-control bg-action-primary px-inset-md py-inset-sm text-label text-on-primary outline-none hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export default function AgentDashboard() {
  const { data: packages, isPending, isError } = usePackages();

  return (
    <div className="flex flex-col gap-stack-lg">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-heading-lg">Your packages</h1>
        <Link href="/agent/packages/new" className={LINK_BUTTON}>
          New package
        </Link>
      </div>
      {isPending && <p role="status">Loading your packages…</p>}
      {isError && (
        <p role="alert" className="text-danger">
          Your packages could not be loaded. Refresh to try again.
        </p>
      )}
      {packages?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-muted shadow-card">
          No packages yet. Start one with New package.
        </p>
      )}
      {packages && packages.length > 0 && (
        <ul className="flex flex-col gap-stack-md">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <Link
                href={`/agent/packages/${pkg.id}`}
                className="flex flex-col gap-stack-sm rounded-card border border-default bg-card p-inset-md shadow-card outline-none hover:border-strong focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="font-heading text-heading-sm">
                  {pkg.streetLine}, {pkg.city}, {pkg.state} {pkg.zip}
                </span>
                <span className="text-label text-muted">
                  {statusLabel(pkg.status)} · {usd.format(pkg.priceExpectationMin)} to{" "}
                  {usd.format(pkg.priceExpectationMax)} · {pkg.photoCount}{" "}
                  {pkg.photoCount === 1 ? "photo" : "photos"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
