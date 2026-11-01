"use client";
// The investor's buy boxes (T324; FR-060): each with its status, strategy label, and default badge,
// a link to edit it, and Pause or Resume, which saves the box with its new status (a resumed box is
// matched again); loading, error, and empty states. Never optimistic (XIII): the list changes once
// the api has answered.
import type { BuyBoxView } from "@clever/contracts/buy-box";
import { Button } from "@clever/ui";
import Link from "next/link";
import { BUY_BOX_STATUS_LABELS, STRATEGY_LABELS } from "@/features/buy-box/labels";
import { buyBoxKeys, useBuyBoxes } from "@/features/buy-box/queries";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { buyBoxes } from "@/lib/bff-client";
import { describeError } from "@/lib/errors";
import { useAction } from "@/lib/use-action";

export default function BuyBoxesPage() {
  const { data: boxes, isPending, isError, error } = useBuyBoxes();
  const toggle = useAction("The buy box could not be changed. Try again.", buyBoxKeys.all);

  const setStatus = ({ id, version, ...box }: BuyBoxView, status: BuyBoxView["status"]) =>
    toggle.run(() => buyBoxes.save(id, { ...box, status, version }));

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <h1 className="font-heading text-heading-lg">Your buy boxes</h1>
        <Link
          href="/investor/buy-boxes/new"
          className="rounded-control bg-action-primary px-inset-md py-inset-sm text-label text-on-primary"
        >
          Add a buy box
        </Link>
      </div>
      {isPending && <p role="status">Loading your buy boxes…</p>}
      {isError && (
        <ErrorNotice error={describeError(error, "Your buy boxes could not be loaded.")} />
      )}
      {toggle.error && <ErrorNotice error={toggle.error} />}
      {boxes?.length === 0 && (
        <p className="rounded-card bg-card p-inset-lg text-muted shadow-card">
          No buy boxes yet. Add one to be matched to listings that fit it.
        </p>
      )}
      <ul className="flex flex-col gap-stack-md">
        {boxes?.map((box) => (
          <li
            key={box.id}
            className="flex flex-wrap items-center justify-between gap-inline-md rounded-card border border-default bg-card p-inset-md shadow-card"
          >
            <span className="flex flex-col gap-stack-sm">
              <Link
                href={`/investor/buy-boxes/${box.id}`}
                className="font-heading text-heading-sm text-link underline"
              >
                {box.name}
              </Link>
              <span className="text-label text-muted">
                {BUY_BOX_STATUS_LABELS[box.status]}
                {box.strategy && ` · ${STRATEGY_LABELS[box.strategy]}`}
                {box.isDefault && " · Default (imported)"}
              </span>
            </span>
            <Button
              variant="secondary"
              isDisabled={toggle.isBusy}
              onPress={() => setStatus(box, box.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}
            >
              {box.status === "ACTIVE" ? `Pause ${box.name}` : `Resume ${box.name}`}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
