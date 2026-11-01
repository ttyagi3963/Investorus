"use client";
// The top of the package page (T301, T316, T330): the page header with the street line, the status
// chip, the place and offer deadline, and, by status, what the agent can do. A draft has Publish,
// which either publishes or lists every blocking field under the header; an open package links to
// compare the offers and can Extend deadline; a package with no offers can be extended or reopened;
// from acceptance on, a link goes to the deal. Withdraw asks in a dialog first (focus moves into it
// and back to the button).
import type { AgentPackageView, PackageStatus } from "@clever/contracts/listing-package";
import { Button, buttonClasses, ConfirmDialog, PACKAGE_STATUS_TONES, StatusChip } from "@clever/ui";
import Link from "next/link";

import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { PageHeader } from "@/features/shell/PageHeader";
import { listingPackages } from "@/lib/bff-client";
import { useAction } from "@/lib/use-action";
import { DeadlineDialog } from "./DeadlineDialog";
import { STATUS_LABELS } from "./labels";
import { PublishBlockers } from "./PublishBlockers";
import { packageKeys } from "./queries";
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

/** The line under the title: where the home is, the offer round, and when offers are due. */
function contextLine(pkg: AgentPackageView): string {
  const p = pkg.property;
  const parts = [`${p.city}, ${p.state} ${p.zip}`];
  if (pkg.round > 1) parts.push(`Offer round ${pkg.round}`);
  if (pkg.status === "ACCEPTING_OFFERS" && pkg.offerDeadline) {
    const passed = Date.parse(pkg.offerDeadline) <= Date.now();
    parts.push(`${passed ? "Offers closed on" : "Offers are due by"} ${when(pkg.offerDeadline)}`);
  }
  return parts.join(" · ");
}

export function PublishPanel({ pkg }: { pkg: AgentPackageView }) {
  const { publish, withdraw, isBusy, blockers, error } = usePublication();
  const round = useAction("The offer round could not be changed. Try again.", packageKeys.all);
  const target = { id: pkg.id, version: pkg.version };
  const busy = isBusy || round.isBusy;

  const actions = (
    <>
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
            round.run(() => listingPackages.reopen(pkg.id, { version: pkg.version, offerDeadline }))
          }
        />
      )}
      {pkg.status === "DRAFT" && (
        <Button onPress={() => publish(target)} isPending={isBusy}>
          Publish
        </Button>
      )}
      {pkg.status === "ACCEPTING_OFFERS" && (
        <Link
          href={`/agent/packages/${pkg.id}/compare`}
          className={buttonClasses({ variant: "cta" })}
        >
          Compare offers
        </Link>
      )}
      {DEAL.includes(pkg.status) && (
        <Link href={`/agent/packages/${pkg.id}/deal`} className={buttonClasses()}>
          Track the deal
        </Link>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={pkg.property.streetLine}
        back={{ href: "/agent", label: "Listing packages" }}
        status={
          <StatusChip tone={PACKAGE_STATUS_TONES[pkg.status]}>
            {STATUS_LABELS[pkg.status]}
          </StatusChip>
        }
        description={contextLine(pkg)}
        actions={actions}
      />
      {pkg.status === "NO_OFFERS_RECEIVED" && (
        <p className="rounded-control bg-status-offers-in p-inset-md text-body text-status-offers-in">
          The deadline passed with no offers. Extend it, reopen for a new round, or withdraw.
        </p>
      )}
      {blockers && <PublishBlockers blockers={blockers} onPage />}
      {error && <ErrorNotice error={error} />}
      {round.error && <ErrorNotice error={round.error} />}
    </>
  );
}
