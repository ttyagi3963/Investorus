"use client";
// The investor's buy boxes (T324, T331; FR-060): a card for each with its status, strategy label,
// default badge, and a short summary of its criteria, a link to edit it, and Pause or Resume, which
// saves the box with its new status (a resumed box is matched again); loading, error, and empty
// states. Never optimistic (XIII): the list changes once the api has answered.
import type { BuyBoxView } from "@clever/contracts/buy-box";
import { BUY_BOX_STATUS_TONES, Button, StatusChip, buttonClasses } from "@clever/ui";
import Link from "next/link";
import {
  BUY_BOXES_DESCRIPTION,
  BUY_BOX_STATUS_LABELS,
  STRATEGY_LABELS,
  buyBoxSummary,
} from "@/features/buy-box/labels";
import { buyBoxKeys, useBuyBoxes } from "@/features/buy-box/queries";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { PageHeader } from "@/features/shell/PageHeader";
import { buyBoxes } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

export default function BuyBoxesPage() {
  const { data: boxes, isPending, isError, error } = useBuyBoxes();
  const toggle = useAction("The buy box could not be changed. Try again.", buyBoxKeys.all);

  const setStatus = ({ id, version, ...box }: BuyBoxView, status: BuyBoxView["status"]) =>
    toggle.run(() => buyBoxes.save(id, { ...box, status, version }));

  return (
    <>
      <PageHeader
        title="Buy boxes"
        description={BUY_BOXES_DESCRIPTION}
        actions={
          <Link href="/investor/buy-boxes/new" className={buttonClasses({ variant: "secondary" })}>
            New buy box
          </Link>
        }
      />
      {isPending && <p role="status">Loading your buy boxes…</p>}
      {isError && (
        <ErrorNotice error={describeError(error, "Your buy boxes could not be loaded.")} />
      )}
      {toggle.error && <ErrorNotice error={toggle.error} />}
      {boxes?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-body-lg text-muted shadow-card">
          No buy boxes yet. Add one to be matched to listings that fit it.
        </p>
      )}
      <ul className="grid grid-cols-1 gap-stack-lg md:grid-cols-2">
        {boxes?.map((box) => (
          <li
            key={box.id}
            className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-inline-md">
              <h2 className="font-heading text-heading-xs font-semibold text-heading">
                <Link
                  href={`/investor/buy-boxes/${box.id}`}
                  className="text-link underline hover:text-link-hover"
                >
                  {box.name}
                </Link>
              </h2>
              <span className="flex flex-wrap items-center gap-inline-sm">
                {box.isDefault && (
                  <span className="inline-flex min-h-chip items-center rounded-pill border border-default px-inset-md text-chip text-muted">
                    Default (imported)
                  </span>
                )}
                <StatusChip tone={BUY_BOX_STATUS_TONES[box.status]}>
                  {BUY_BOX_STATUS_LABELS[box.status]}
                </StatusChip>
              </span>
            </div>
            <p className="text-body text-muted">
              {buyBoxSummary(box)}
              {box.strategy && ` · ${STRATEGY_LABELS[box.strategy]}`}
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                isDisabled={toggle.isBusy}
                onPress={() => setStatus(box, box.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
              >
                {box.status === "ACTIVE" ? `Pause ${box.name}` : `Resume ${box.name}`}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
