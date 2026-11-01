"use client";
// The top of the package page (T301, T316): the status and, by status, what the agent can do. A
// draft has Publish, which either publishes or lists every blocking field; an open package shows
// the deadline, how many investors matched, a link to compare the offers, and Extend deadline; a
// package with no offers can be extended or reopened; from acceptance on, a link goes to the deal.
// Withdraw asks in a dialog first (focus moves into it and back to the button).
import type { AgentPackageView, PackageStatus } from "@clever/contracts/listing-package";
import { Button, ConfirmDialog, FormDialog, TextField } from "@clever/ui";
import Link from "next/link";
import { toLocalInput } from "@/features/decisions/DecisionDialogs";
import { useAgentAction } from "@/features/decisions/useAgentAction";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { listingPackages } from "@/lib/bff-client";
import { STATUS_LABELS } from "./labels";
import { PublishBlockers } from "./PublishBlockers";
import { usePublication } from "./usePublication";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
const WITHDRAWABLE: PackageStatus[] = ["DRAFT", "ACCEPTING_OFFERS", "NO_OFFERS_RECEIVED"];
const DEAL: PackageStatus[] = [
  "OFFER_ACCEPTED",
  "UNDER_CONTRACT",
  "INSPECTION",
  "CLOSING",
  "CLOSED",
  "FELL_THROUGH",
];

/** A new deadline, three days out unless the agent picks another. */
function DeadlineDialog({
  label,
  title,
  note,
  onSubmit,
  isDisabled,
}: {
  label: string;
  title: string;
  note: string;
  onSubmit: (offerDeadline: string) => void;
  isDisabled: boolean;
}) {
  return (
    <FormDialog
      triggerLabel={label}
      title={title}
      submitLabel={label}
      cancelLabel="Cancel"
      isDisabled={isDisabled}
      onSubmit={(values) => onSubmit(new Date(String(values.get("offerDeadline"))).toISOString())}
    >
      <p>{note}</p>
      <TextField
        name="offerDeadline"
        type="datetime-local"
        label="New offer deadline"
        defaultValue={toLocalInput(new Date(Date.now() + 72 * 3_600_000).toISOString())}
        isRequired
      />
    </FormDialog>
  );
}

export function PublishPanel({ pkg }: { pkg: AgentPackageView }) {
  const { publish, withdraw, isBusy, blockers, error } = usePublication();
  const round = useAgentAction("The offer round could not be changed. Try again.");
  const target = { id: pkg.id, version: pkg.version };
  const busy = isBusy || round.isBusy;
  const deadlinePassed = pkg.offerDeadline !== null && Date.parse(pkg.offerDeadline) <= Date.now();

  return (
    <section
      aria-label="Status"
      className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
    >
      <p className="font-heading text-heading-sm">
        {STATUS_LABELS[pkg.status]}
        {pkg.round > 1 ? ` (offer round ${pkg.round})` : ""}
      </p>
      {pkg.status === "ACCEPTING_OFFERS" && pkg.offerDeadline && (
        <p>
          {deadlinePassed ? "Offers closed on" : "Offers are due by"} {when(pkg.offerDeadline)}.
          Matched investors: {pkg.matchedCount}.
        </p>
      )}
      {pkg.status === "NO_OFFERS_RECEIVED" && (
        <p>The deadline passed with no offers. Extend it, reopen for a new round, or withdraw.</p>
      )}
      <div className="flex flex-wrap gap-inline-md">
        {pkg.status === "DRAFT" && (
          <Button onPress={() => publish(target)} isPending={isBusy}>
            Publish
          </Button>
        )}
        {pkg.status === "ACCEPTING_OFFERS" && (
          <Link
            href={`/agent/packages/${pkg.id}/compare`}
            className="rounded-control bg-action-primary px-inset-md py-inset-sm text-label text-on-primary"
          >
            Compare offers
          </Link>
        )}
        {DEAL.includes(pkg.status) && (
          <Link
            href={`/agent/packages/${pkg.id}/deal`}
            className="rounded-control bg-action-primary px-inset-md py-inset-sm text-label text-on-primary"
          >
            Track the deal
          </Link>
        )}
        {(pkg.status === "ACCEPTING_OFFERS" || pkg.status === "NO_OFFERS_RECEIVED") && (
          <DeadlineDialog
            label="Extend deadline"
            title="Extend the offer deadline?"
            note="Matched investors are told the new deadline. It must be later than the current one."
            isDisabled={busy}
            onSubmit={(offerDeadline) =>
              round.run(() =>
                listingPackages.extendDeadline(pkg.id, { version: pkg.version, offerDeadline }),
              )
            }
          />
        )}
        {pkg.status === "NO_OFFERS_RECEIVED" && (
          <DeadlineDialog
            label="Reopen"
            title="Reopen for a new offer round?"
            note="Matching runs again, and every matched investor is told about the new round."
            isDisabled={busy}
            onSubmit={(offerDeadline) =>
              round.run(() =>
                listingPackages.reopen(pkg.id, { version: pkg.version, offerDeadline }),
              )
            }
          />
        )}
        {WITHDRAWABLE.includes(pkg.status) && (
          <ConfirmDialog
            triggerLabel="Withdraw"
            title="Withdraw this package?"
            message="Open offers are declined and matched investors are told. This cannot be undone."
            confirmLabel="Yes, withdraw"
            cancelLabel="Keep it"
            onConfirm={() => withdraw(target)}
            isDisabled={busy}
          />
        )}
      </div>
      {blockers && <PublishBlockers blockers={blockers} onPage />}
      {error && <ErrorNotice error={error} />}
      {round.error && <ErrorNotice error={round.error} />}
    </section>
  );
}
