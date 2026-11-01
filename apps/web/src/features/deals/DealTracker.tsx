"use client";
// The agent's deal tracker (T316; FR-055 to FR-058): the milestones as a step list with the current
// one marked, a button only for the allowed next milestone, a fall-through dialog that needs a
// reason, and after a fall-through the backups ranked by net proceeds with Promote. With no usable
// backup left, the agent reopens the package for a new round or withdraws it. Nothing changes on
// screen until the api answers (never optimistic, XIII).
import type { DealView } from "@clever/contracts/deal";
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Button, ConfirmDialog, FormDialog, TextField } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { DeadlineDialog } from "@/features/listing-package/DeadlineDialog";
import { DEAL_STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { packageKeys } from "@/features/listing-package/queries";
import { deals, listingPackages } from "@/lib/bff-client";
import { useAction } from "@/lib/use-action";

const SECTION = "flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card";
const STEPS = ["OFFER_ACCEPTED", "UNDER_CONTRACT", "INSPECTION", "CLOSING", "CLOSED"] as const;
const OPEN = ["OFFER_ACCEPTED", "UNDER_CONTRACT", "INSPECTION", "CLOSING"];
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function DealTracker({ pkg, deal }: { pkg: AgentPackageView; deal: DealView }) {
  const { run, isBusy, error } = useAction(
    "That change could not be saved. Try again.",
    packageKeys.all,
  );
  const current = STEPS.indexOf(deal.status as (typeof STEPS)[number]);
  const usable = deal.backups.filter((b) => !b.expired);
  const decided = pkg.status === "FELL_THROUGH" && deal.status !== "PENDING_RECONFIRMATION";

  return (
    <div className="flex flex-col gap-stack-lg">
      {error && <ErrorNotice error={error} />}
      <section aria-labelledby="deal-heading" className={SECTION}>
        <h2 id="deal-heading" className="font-heading text-heading-sm">
          {DEAL_STATUS_LABELS[deal.status]}
        </h2>
        <p>
          Buyer: {deal.investorName}, {formatUsd(deal.offer.price)},{" "}
          {deal.offer.paymentType === "CASH" ? "cash" : "financed"}, closing{" "}
          {deal.offer.closingDate}
          {deal.promotedFromBackup ? " (promoted from backup)" : ""}.
        </p>
        {deal.status === "PENDING_RECONFIRMATION" && deal.reconfirmBy && (
          <p role="status">
            Waiting for {deal.investorName} to reconfirm by {when(deal.reconfirmBy)}.
          </p>
        )}
        {deal.fellThroughReason && <p>Reason it fell through: {deal.fellThroughReason}</p>}
        {current >= 0 && (
          <ol aria-label="Milestones" className="flex flex-wrap gap-inline-md">
            {STEPS.map((step, index) => (
              <li
                key={step}
                aria-current={index === current ? "step" : undefined}
                className={
                  index === current
                    ? "rounded-control bg-action-primary px-inset-sm py-inset-sm text-on-primary"
                    : `rounded-control border border-default px-inset-sm py-inset-sm ${index < current ? "" : "text-muted"}`
                }
              >
                {index < current ? "Done: " : ""}
                {DEAL_STATUS_LABELS[step]}
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-inline-md">
          {deal.allowedNextMilestones.map((milestone) => (
            <Button
              key={milestone}
              isPending={isBusy}
              onPress={() =>
                run(() => deals.recordMilestone(deal.id, { milestone, version: deal.version }))
              }
            >
              Move to {DEAL_STATUS_LABELS[milestone].toLowerCase()}
            </Button>
          ))}
          {OPEN.includes(deal.status) && (
            <FormDialog
              triggerLabel="Mark as fallen through"
              title="Mark this deal as fallen through?"
              submitLabel="Mark fallen through"
              cancelLabel="Keep the deal"
              isDisabled={isBusy}
              onSubmit={(values) =>
                run(() =>
                  deals.fallThrough(deal.id, {
                    reason: String(values.get("reason") ?? ""),
                    version: deal.version,
                  }),
                )
              }
            >
              <p>
                The buyer loses access to the seller&apos;s details. You can then promote a backup.
              </p>
              <TextField
                name="reason"
                label="Why it fell through"
                description="Only you see this reason."
                maxLength={500}
                isRequired
              />
            </FormDialog>
          )}
        </div>
      </section>

      {pkg.status === "FELL_THROUGH" && (
        <section aria-labelledby="backups-heading" className={SECTION}>
          <h2 id="backups-heading" className="font-heading text-heading-sm">
            Backup offers, best net proceeds first
          </h2>
          {deal.backups.length === 0 && <p className="text-muted">No backup offers remain.</p>}
          <ul className="flex flex-col gap-stack-sm">
            {deal.backups.map((backup) => (
              <li
                key={backup.offer.id}
                className="flex flex-wrap items-center justify-between gap-inline-md rounded-control border border-default p-inset-md"
              >
                <span>
                  {backup.investorName}: {formatUsd(backup.offer.price)}, net{" "}
                  {formatUsd(backup.netProceeds)}, closing {backup.offer.closingDate}
                  {backup.expired ? " (expired)" : ""}
                </span>
                {!backup.expired && decided && (
                  <ConfirmDialog
                    triggerLabel="Promote"
                    title={`Promote ${backup.investorName}'s offer?`}
                    message="They are asked to reconfirm within 48 hours. If they do, the deal is back at Offer accepted with them as buyer."
                    confirmLabel="Yes, promote"
                    cancelLabel="Not yet"
                    isDisabled={isBusy}
                    onConfirm={() =>
                      run(() =>
                        listingPackages.promoteBackup(pkg.id, {
                          offerId: backup.offer.id,
                          version: pkg.version,
                        }),
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ul>
          {decided && usable.length === 0 && (
            <div className="flex flex-wrap gap-inline-md">
              <DeadlineDialog
                label="Reopen for a new round"
                title="Reopen the package?"
                note="Matched investors are told again and can make new offers."
                triggerVariant="primary"
                isDisabled={isBusy}
                onSubmit={(offerDeadline) =>
                  run(() => listingPackages.reopen(pkg.id, { version: pkg.version, offerDeadline }))
                }
              />
              <ConfirmDialog
                triggerLabel="Withdraw"
                title="Withdraw this package?"
                message="Open offers are declined and matched investors are told. This cannot be undone."
                confirmLabel="Yes, withdraw"
                cancelLabel="Keep it"
                isDisabled={isBusy}
                onConfirm={() =>
                  run(() => listingPackages.withdraw(pkg.id, { version: pkg.version }))
                }
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
