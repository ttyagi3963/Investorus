"use client";
// The agent's listing packages (T269, T301, T330): a table of their packages with the address,
// photo count, status, price range, matched investors, and offer deadline, each linking to its page;
// a Publish button on each draft, which either publishes or lists every blocking field with a link
// to it; loading, error, and empty states, and a "New package" link. Status tabs with counts filter
// the table (T359).
import type { AgentPackageSummary } from "@clever/contracts/listing-package";
import {
  Button,
  buttonClasses,
  Card,
  PACKAGE_STATUS_TONES,
  StatusChip,
  Thumbnail,
} from "@clever/ui";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { PublishBlockers } from "@/features/listing-package/PublishBlockers";
import { useStatusFilter, type StatusGroup } from "@/features/listing-package/StatusFilter";
import { usePackages } from "@/features/listing-package/queries";
import { usePublication } from "@/features/listing-package/usePublication";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

const HEAD = "px-inset-md py-inset-md text-left text-label text-muted";
const CELL = "px-inset-md py-inset-md align-middle";
const NUMBER = "text-right tabular-nums";

const shortWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** The deadline column: when offers are due, or when the round closed. */
function deadlineText(pkg: AgentPackageSummary): string {
  if (pkg.status === "DRAFT") return "Not published";
  if (!pkg.offerDeadline) return "None";
  const passed = Date.parse(pkg.offerDeadline) <= Date.now();
  return `${passed ? "Closed " : ""}${shortWhen(pkg.offerDeadline)}`;
}

/** A draft's Publish button, from the version the list read. */
function PublishDraft({ pkg }: { pkg: AgentPackageSummary }) {
  const { publish, isBusy, blockers, error } = usePublication();
  return (
    <div className="flex flex-col items-end gap-stack-sm">
      <Button
        size="sm"
        onPress={() => publish({ id: pkg.id, version: pkg.version })}
        isPending={isBusy}
      >
        Publish
      </Button>
      {blockers && <PublishBlockers blockers={blockers} onPage={false} />}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}

function PackageRow({ pkg }: { pkg: AgentPackageSummary }) {
  const photos =
    pkg.photoCount === 0
      ? "No photos yet"
      : `${pkg.photoCount} ${pkg.photoCount === 1 ? "photo" : "photos"}`;
  return (
    <tr className="border-t border-subtle">
      <th scope="row" className={`${CELL} text-left font-normal`}>
        <div className="flex items-center gap-inline-md">
          {/* The list carries no photo address, so every row shows the no-image state. */}
          <Thumbnail src={pkg.photoUrl} alt="" />
          <div className="flex flex-col gap-stack-xs">
            <Link
              href={`/agent/packages/${pkg.id}`}
              className="text-body-lg font-semibold text-heading hover:text-link hover:underline"
            >
              {pkg.streetLine}
            </Link>
            <span className="text-helper text-muted">
              {pkg.city}, {pkg.state} {pkg.zip}
            </span>
            <span className="text-caption text-muted">{photos}</span>
          </div>
        </div>
      </th>
      <td className={CELL}>
        <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>{STATUS_LABELS[pkg.status]}</StatusChip>
      </td>
      <td className={`${CELL} text-body`}>
        {formatUsd(pkg.priceExpectationMin)} to {formatUsd(pkg.priceExpectationMax)}
      </td>
      <td className={`${CELL} ${NUMBER} text-body-lg`}>
        {pkg.status === "DRAFT" ? (
          <>
            <span aria-hidden="true">–</span>
            <span className="sr-only">Not matched yet</span>
          </>
        ) : (
          pkg.matchedCount
        )}
      </td>
      <td className={`${CELL} text-body text-muted`}>{deadlineText(pkg)}</td>
      <td className={`${CELL} text-right`}>
        {pkg.status === "DRAFT" && <PublishDraft pkg={pkg} />}
      </td>
    </tr>
  );
}

const newPackageLink = (
  <Link href="/agent/packages/new" className={buttonClasses()}>
    New package
  </Link>
);

const among =
  (...statuses: AgentPackageSummary["status"][]) =>
  (pkg: AgentPackageSummary) =>
    statuses.includes(pkg.status);

const GROUPS: StatusGroup<AgentPackageSummary>[] = [
  { id: "all", label: "All", includes: () => true },
  { id: "draft", label: "Draft", includes: among("DRAFT") },
  { id: "open", label: "Open for offers", includes: among("ACCEPTING_OFFERS") },
  {
    id: "contract",
    label: "Under contract",
    includes: among("OFFER_ACCEPTED", "UNDER_CONTRACT", "INSPECTION", "CLOSING"),
  },
  {
    id: "decide",
    label: "Needs a decision",
    includes: among("NO_OFFERS_RECEIVED", "FELL_THROUGH"),
  },
  { id: "ended", label: "Closed or withdrawn", includes: among("CLOSED", "WITHDRAWN") },
];

export default function AgentDashboard() {
  const { data: packages, isPending, isError, error } = usePackages();
  const { shown, tabs, groupLabel } = useStatusFilter(packages ?? [], GROUPS);

  return (
    <>
      <PageHeader
        title="Listing packages"
        description="Build a package once, publish it, and offers come back here."
        actions={newPackageLink}
      />
      {isPending && <p role="status">Loading your packages…</p>}
      {isError && (
        <ErrorNotice
          error={describeError(error, "Your packages could not be loaded. Refresh to try again.")}
        />
      )}
      {packages?.length === 0 && (
        <Card>
          <p className="text-body-lg text-muted">
            No packages yet. Start one, publish it, and matching investors are told.
          </p>
          <div>{newPackageLink}</div>
        </Card>
      )}
      {packages && packages.length > 0 && tabs}
      {packages && packages.length > 0 && shown.length === 0 && (
        <p role="status" className="text-body text-muted">
          No packages in {groupLabel.toLowerCase()}.
        </p>
      )}
      {shown.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <caption className="sr-only">Your listing packages</caption>
              <thead>
                <tr>
                  <th scope="col" className={HEAD}>
                    Property
                  </th>
                  <th scope="col" className={HEAD}>
                    Status
                  </th>
                  <th scope="col" className={HEAD}>
                    Price range
                  </th>
                  <th scope="col" className={`${HEAD} text-right`}>
                    Matched
                  </th>
                  <th scope="col" className={HEAD}>
                    Offer deadline
                  </th>
                  <th scope="col" className={HEAD}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((pkg) => (
                  <PackageRow key={pkg.id} pkg={pkg} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
