"use client";
// The deal page (T316, restyled in T330): the package's accepted offer tracked to closing, or, after
// a fall-through, its backups. Before any acceptance there is no deal, and the page says so.
import { buttonClasses, Card, DEAL_STATUS_TONES, StatusChip } from "@clever/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDeal } from "@/features/decisions/queries";
import { DealTracker } from "@/features/deals/DealTracker";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { DEAL_STATUS_LABELS, STATUS_LABELS } from "@/features/listing-package/labels";
import { usePackage } from "@/features/listing-package/queries";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError, isGone } from "@/lib/errors";

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const pkg = usePackage(id);
  const deal = useDeal(id);
  const p = pkg.data;

  return (
    <>
      <PageHeader
        back={{
          href: `/agent/packages/${id}`,
          label: p
            ? `${p.property.streetLine}, ${p.property.city}, ${p.property.state} ${p.property.zip}`
            : "Back to the package",
        }}
        title="Deal"
        status={
          deal.data && (
            <StatusChip tone={DEAL_STATUS_TONES[deal.data.status]}>
              {DEAL_STATUS_LABELS[deal.data.status]}
            </StatusChip>
          )
        }
        description={p && `Package status: ${STATUS_LABELS[p.status]}`}
      />
      {(deal.isPending || pkg.isPending) && <p role="status">Loading the deal…</p>}
      {deal.isError &&
        (isGone(deal.error) ? (
          <Card>
            <p className="text-body-lg text-default">No offer has been accepted yet.</p>
            <div>
              <Link href={`/agent/packages/${id}/compare`} className={buttonClasses()}>
                Compare offers
              </Link>
            </div>
          </Card>
        ) : (
          <ErrorNotice error={describeError(deal.error, "The deal could not be loaded.")} />
        ))}
      {p && deal.data && <DealTracker pkg={p} deal={deal.data} />}
    </>
  );
}
