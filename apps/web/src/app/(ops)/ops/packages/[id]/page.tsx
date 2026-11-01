"use client";
// One package's trace for operations (T342; design 09, FR-073, FR-074): the address and status, the
// counts (buy boxes evaluated, matched, delivered, failed, offers), the timeline, and the investors
// with why each was or was not matched. A retry button appears while deliveries need attention.
import { PACKAGE_STATUS_TONES, StatTile, StatusChip } from "@clever/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS } from "@/features/listing-package/labels";
import { BulkActions } from "@/features/ops/OpsActions";
import { usePackageTrace } from "@/features/ops/queries";
import { TraceInvestors } from "@/features/ops/TraceInvestors";
import { TraceTimeline } from "@/features/ops/TraceTimeline";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

const back = { href: "/ops/packages", label: "Packages" };

export default function PackageTracePage() {
  const { id } = useParams<{ id: string }>();
  const { data: trace, isPending, isError, error } = usePackageTrace(id);

  if (!trace) {
    return (
      <>
        <PageHeader title="Package trace" back={back} />
        {isPending && <p role="status">Loading the package trace…</p>}
        {isError && (
          <ErrorNotice error={describeError(error, "The package trace could not be loaded.")} />
        )}
      </>
    );
  }

  const { package: pkg, stats } = trace;
  const failed = stats.needsAttention;
  return (
    <>
      <PageHeader
        back={back}
        title={`${pkg.streetLine}, ${pkg.city}, ${pkg.state} ${pkg.zip}`}
        status={
          <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>
            {STATUS_LABELS[pkg.status]}
          </StatusChip>
        }
        description={`Package ${pkg.id} · Listing version ${pkg.listingVersion} · Offer round ${pkg.round}`}
        actions={
          failed > 0 && <BulkActions retryLabel="Retry failed deliveries" packageId={pkg.id} />
        }
      />
      {isError && <ErrorNotice error={describeError(error, "The trace could not be refreshed.")} />}
      <section
        aria-label="Counts"
        className="grid grid-cols-2 gap-inline-md sm:grid-cols-3 lg:grid-cols-5"
      >
        <StatTile label="Buy boxes evaluated" value={stats.evaluated ?? "—"} />
        <StatTile label="Matched" value={stats.matched} />
        <StatTile label="Delivered" value={stats.delivered} />
        {failed > 0 ? (
          <Link
            href="/ops/deliveries?status=NEEDS_ATTENTION"
            className="rounded-control hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <StatTile label="Delivery failed" value={failed} tone="error" />
          </Link>
        ) : (
          <StatTile label="Delivery failed" value={0} />
        )}
        <StatTile label="Offers" value={stats.offers} />
      </section>
      <div className="grid items-start gap-stack-lg lg:grid-cols-3">
        <TraceTimeline entries={trace.timeline} />
        <div className="lg:col-span-2">
          <TraceInvestors trace={trace} />
        </div>
      </div>
    </>
  );
}
