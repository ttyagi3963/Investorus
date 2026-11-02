"use client";
// The agent's deal tracker (T316, restyled in T330; FR-055 to FR-058): the buyer's terms, the
// milestones as a stepper with the current one marked, a button only for the allowed next milestone,
// a fall-through dialog that needs a reason, and after a fall-through the backups ranked by net
// proceeds with Promote (a deactivated investor's backup is flagged and cannot be promoted, T370).
// While no promoted backup is deciding, the agent can instead reopen the package for a new round or
// withdraw it, declining any backups left (T377). Nothing changes on screen until the api answers
// (never optimistic, XIII).
import type { DealView } from "@clever/contracts/deal";
import type { AgentPackageView } from "@clever/contracts/listing-package";
import {
  Button,
  Card,
  ConfirmDialog,
  FormDialog,
  OFFER_STATUS_TONES,
  StatTile,
  StatusChip,
  TextField,
} from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { DeadlineDialog } from "@/features/listing-package/DeadlineDialog";
import { DEAL_STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { packageKeys } from "@/features/listing-package/queries";
import { deals, listingPackages } from "@/lib/bff-client";
import { useAction } from "@/lib/use-action";

const STEPS = ["OFFER_ACCEPTED", "UNDER_CONTRACT", "INSPECTION", "CLOSING", "CLOSED"] as const;
const OPEN = ["OFFER_ACCEPTED", "UNDER_CONTRACT", "INSPECTION", "CLOSING"];
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
/** A `YYYY-MM-DD` date, read as that calendar day wherever the browser is. */
const day = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** The milestones in order: done ones in the accent, the current one in the call-to-action color. */
function Milestones({ current }: { current: number }) {
  return (
    <ol aria-label="Milestones" className="grid grid-cols-1 gap-inline-md sm:grid-cols-5">
      {STEPS.map((step, index) => {
        const state = index < current ? "Done" : index === current ? "Now" : "Not yet";
        const bar =
          index < current
            ? "border-t-selected"
            : index === current
              ? "border-t-cta"
              : "border-t-subtle";
        return (
          <li
            key={step}
            aria-current={index === current ? "step" : undefined}
            className={`flex flex-col gap-stack-xs border-t-4 pt-inset-sm ${bar}`}
          >
            <span
              className={`text-body ${index === current ? "font-semibold text-heading" : index < current ? "text-default" : "text-muted"}`}
            >
              {DEAL_STATUS_LABELS[step]}
            </span>
            <span className="text-helper text-muted">{state}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function DealTracker({ pkg, deal }: { pkg: AgentPackageView; deal: DealView }) {
  const { run, isBusy, error } = useAction(
    "That change could not be saved. Try again.",
    packageKeys.all,
  );
  const current = STEPS.indexOf(deal.status as (typeof STEPS)[number]);
  const usable = deal.backups.filter((b) => !b.expired && b.investorActive);
  const decided = pkg.status === "FELL_THROUGH" && deal.status !== "PENDING_RECONFIRMATION";
  const canFallThrough = OPEN.includes(deal.status);

  return (
    <>
      {error && <ErrorNotice error={error} />}
      <Card
        title="Buyer and terms"
        description={deal.promotedFromBackup ? "Promoted from a backup offer." : undefined}
      >
        <div className="grid grid-cols-1 gap-inline-md sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Buyer" value={deal.investorName} />
          <StatTile label="Price" value={formatUsd(deal.offer.price)} />
          <StatTile
            label="Payment"
            value={deal.offer.paymentType === "CASH" ? "Cash" : "Financed"}
          />
          <StatTile label="Closing" value={day(deal.offer.closingDate)} />
        </div>
        {deal.status === "PENDING_RECONFIRMATION" && deal.reconfirmBy && (
          <p
            role="status"
            className="rounded-control bg-status-offers-in p-inset-md text-status-offers-in"
          >
            Waiting for {deal.investorName} to reconfirm by {when(deal.reconfirmBy)}.
          </p>
        )}
        {deal.fellThroughReason && (
          <p className="rounded-control bg-status-error p-inset-md text-status-error">
            Reason it fell through: {deal.fellThroughReason}
          </p>
        )}
      </Card>

      {(current >= 0 || deal.allowedNextMilestones.length > 0 || canFallThrough) && (
        <Card title="Milestones">
          {current >= 0 && <Milestones current={current} />}
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
            {canFallThrough && (
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
                  The buyer loses access to the seller&apos;s details. You can then promote a
                  backup.
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
        </Card>
      )}

      {pkg.status === "FELL_THROUGH" && (
        <Card title="Backup offers, best net proceeds first">
          {deal.backups.length === 0 && <p className="text-muted">No backup offers remain.</p>}
          <ul className="flex flex-col gap-stack-sm">
            {deal.backups.map((backup) => (
              <li
                key={backup.offer.id}
                className="flex flex-wrap items-center justify-between gap-inline-md rounded-control border border-subtle p-inset-md"
              >
                <div className="flex flex-col gap-stack-xs">
                  <span className="flex flex-wrap items-center gap-inline-sm">
                    <span className="text-body-lg font-semibold text-heading">
                      {backup.investorName}
                    </span>
                    {backup.expired && (
                      <StatusChip tone={OFFER_STATUS_TONES.EXPIRED}>Expired</StatusChip>
                    )}
                    {!backup.investorActive && <StatusChip tone="error">Deactivated</StatusChip>}
                  </span>
                  <span className="text-body text-muted">
                    {formatUsd(backup.offer.price)} · net {formatUsd(backup.netProceeds)} · closing{" "}
                    {day(backup.offer.closingDate)}
                  </span>
                </div>
                {!backup.expired && backup.investorActive && decided && (
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
          {decided && (
            <div className="flex flex-wrap gap-inline-md">
              <DeadlineDialog
                label="Reopen for a new round"
                title="Reopen the package?"
                note={
                  deal.backups.length > 0
                    ? "The backup offers are declined and their investors told. Matched investors are told again and can make new offers."
                    : "Matched investors are told again and can make new offers."
                }
                triggerVariant={usable.length === 0 ? "primary" : "secondary"}
                isDisabled={isBusy}
                onSubmit={(offerDeadline) =>
                  run(() => listingPackages.reopen(pkg.id, { version: pkg.version, offerDeadline }))
                }
              />
              <ConfirmDialog
                triggerLabel="Withdraw"
                title="Withdraw this package?"
                message="Backup offers are declined and matched investors are told. This cannot be undone."
                confirmLabel="Yes, withdraw"
                cancelLabel="Keep it"
                isDisabled={isBusy}
                onConfirm={() =>
                  run(() => listingPackages.withdraw(pkg.id, { version: pkg.version }))
                }
              />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
