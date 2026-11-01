"use client";
// The agent's dashboard (T269, T301): their packages with address, status, price range, photo count,
// and matched investors, each linking to its page; a Publish button on each draft, which either
// publishes or lists every blocking field with a link to it; loading, error, and empty states, and
// a "New package" link.
import type { AgentPackageSummary } from "@clever/contracts/listing-package";
import { Button } from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { PublishBlockers } from "@/features/listing-package/PublishBlockers";
import { usePackages } from "@/features/listing-package/queries";
import { usePublication } from "@/features/listing-package/usePublication";
import { describeError } from "@/lib/errors";

const LINK_BUTTON =
  "rounded-control bg-action-primary px-inset-md py-inset-sm text-label text-on-primary outline-none hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** A draft's Publish button, from the version the list read. */
function PublishDraft({ pkg }: { pkg: AgentPackageSummary }) {
  const { publish, isBusy, blockers, error } = usePublication();
  return (
    <div className="flex flex-col gap-stack-sm">
      <div>
        <Button onPress={() => publish({ id: pkg.id, version: pkg.version })} isPending={isBusy}>
          Publish
        </Button>
      </div>
      {blockers && <PublishBlockers blockers={blockers} onPage={false} />}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: AgentPackageSummary }) {
  const photos = `${pkg.photoCount} ${pkg.photoCount === 1 ? "photo" : "photos"}`;
  const matched =
    pkg.status === "DRAFT"
      ? ""
      : ` · ${pkg.matchedCount} matched investor${pkg.matchedCount === 1 ? "" : "s"}`;
  return (
    <li className="flex flex-col gap-stack-sm rounded-card border border-default bg-card p-inset-md shadow-card">
      <Link
        href={`/agent/packages/${pkg.id}`}
        className="flex flex-col gap-stack-sm outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <span className="font-heading text-heading-sm">
          {pkg.streetLine}, {pkg.city}, {pkg.state} {pkg.zip}
        </span>
        <span className="text-label text-muted">
          {STATUS_LABELS[pkg.status]} · {formatUsd(pkg.priceExpectationMin)} to{" "}
          {formatUsd(pkg.priceExpectationMax)} · {photos}
          {matched}
        </span>
      </Link>
      {pkg.status === "DRAFT" && <PublishDraft pkg={pkg} />}
    </li>
  );
}

export default function AgentDashboard() {
  const { data: packages, isPending, isError, error } = usePackages();

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
        <ErrorNotice
          error={describeError(error, "Your packages could not be loaded. Refresh to try again.")}
        />
      )}
      {packages?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-muted shadow-card">
          No packages yet. Start one with New package.
        </p>
      )}
      {packages && packages.length > 0 && (
        <ul className="flex flex-col gap-stack-md">
          {packages.map((pkg) => (
            <PackageRow key={pkg.id} pkg={pkg} />
          ))}
        </ul>
      )}
    </div>
  );
}
