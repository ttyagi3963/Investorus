"use client";
// The deal page (T316): the package's accepted offer tracked to closing, or, after a fall-through,
// its backups. Before any acceptance there is no deal, and the page says so.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeal } from "@/features/decisions/queries";
import { DealTracker } from "@/features/deals/DealTracker";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS } from "@/features/listing-package/labels";
import { usePackage } from "@/features/listing-package/queries";
import { describeError } from "@/lib/errors";

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const pkg = usePackage(id);
  const deal = useDeal(id);

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href={`/agent/packages/${id}`} className="text-label text-link underline">
        Back to the package
      </Link>
      <h1 className="font-heading text-heading-lg">
        Deal{pkg.data ? `: ${pkg.data.property.streetLine}` : ""}
      </h1>
      {pkg.data && <p>Package status: {STATUS_LABELS[pkg.data.status]}</p>}
      {(deal.isPending || pkg.isPending) && <p role="status">Loading the deal…</p>}
      {deal.isError && (
        <ErrorNotice error={describeError(deal.error, "No offer has been accepted yet.")} />
      )}
      {pkg.data && deal.data && <DealTracker pkg={pkg.data} deal={deal.data} />}
    </div>
  );
}
