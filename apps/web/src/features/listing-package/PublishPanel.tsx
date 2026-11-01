"use client";
// The top of the package page (T301): the status and, by status, what the agent can do. A draft has
// Publish, which either publishes or lists every blocking field; an open package shows the deadline
// and how many investors matched, and Withdraw, which asks for confirmation first.
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Button } from "@clever/ui";
import { useState } from "react";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { STATUS_LABELS } from "./labels";
import { PublishBlockers } from "./PublishBlockers";
import { usePublication } from "./usePublication";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export function PublishPanel({ pkg }: { pkg: AgentPackageView }) {
  const { publish, withdraw, isBusy, blockers, error } = usePublication();
  const [confirming, setConfirming] = useState(false);
  const target = { id: pkg.id, version: pkg.version };

  return (
    <section
      aria-label="Status"
      className="flex flex-col gap-stack-md rounded-card bg-card p-inset-lg shadow-card"
    >
      <p className="font-heading text-heading-sm">{STATUS_LABELS[pkg.status]}</p>
      {pkg.status === "ACCEPTING_OFFERS" && pkg.offerDeadline && (
        <p>
          Offers are due by {when(pkg.offerDeadline)}. Matched investors: {pkg.matchedCount}.
        </p>
      )}
      {pkg.status === "DRAFT" && (
        <div>
          <Button onPress={() => publish(target)} isPending={isBusy}>
            Publish
          </Button>
        </div>
      )}
      {pkg.status !== "WITHDRAWN" && !confirming && (
        <div>
          <Button variant="secondary" onPress={() => setConfirming(true)} isDisabled={isBusy}>
            Withdraw
          </Button>
        </div>
      )}
      {confirming && (
        <div role="group" aria-label="Confirm withdrawal" className="flex flex-col gap-stack-sm">
          <p>
            Withdraw this package? Open offers are declined and matched investors are told. This
            cannot be undone.
          </p>
          <div className="flex gap-inline-md">
            <Button
              onPress={() => {
                setConfirming(false);
                withdraw(target);
              }}
            >
              Yes, withdraw
            </Button>
            <Button variant="secondary" onPress={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {blockers && <PublishBlockers blockers={blockers} onPage />}
      {error && <ErrorNotice error={error} />}
    </section>
  );
}
