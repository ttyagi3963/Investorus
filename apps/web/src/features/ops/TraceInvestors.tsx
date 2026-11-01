"use client";
// The trace's investors card (T342; design 09, FR-073, FR-074): matched investors with the buy
// boxes that matched, their notice's delivery, and their offer; or the active investors the package
// did not match. Each row opens, in place, why the investor was or was not matched.
import type { PackageTrace, TraceInvestor } from "@clever/contracts/ops";
import { Button, Card, OFFER_STATUS_TONES, StatusChip, SegmentedControl } from "@clever/ui";
import { useId, useState } from "react";
import { OFFER_STATUS_LABELS, formatUsd } from "@/features/listing-package/labels";
import { DELIVERY_STATUS_LABELS, DELIVERY_STATUS_TONES } from "./labels";
import { MatchExplanation } from "./MatchExplanation";

type View = "matched" | "excluded";
const VIEWS = [
  { id: "matched", label: "Matched" },
  { id: "excluded", label: "Not matched" },
] as const;

const HEAD = "py-inset-sm pr-inset-md text-left text-helper font-semibold text-muted";
const CELL = "py-inset-md pr-inset-md align-middle text-body";

/** A button that shows or hides the explanation it controls (the disclosure pattern). */
function ExplainToggle({
  label,
  open,
  panelId,
  onToggle,
}: {
  label: string;
  open: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-expanded={open}
      aria-controls={panelId}
      onPress={onToggle}
    >
      {label}
    </Button>
  );
}

function Notification({ notification }: { notification: TraceInvestor["notification"] }) {
  if (!notification) return <StatusChip tone="draft">In app only</StatusChip>;
  return (
    <div className="flex flex-col items-start gap-stack-xs">
      <StatusChip tone={DELIVERY_STATUS_TONES[notification.status]}>
        {DELIVERY_STATUS_LABELS[notification.status]}
      </StatusChip>
      {notification.lastError && (
        <span className="text-helper text-muted">{notification.lastError}</span>
      )}
    </div>
  );
}

function MatchedRow({ packageId, investor }: { packageId: string; investor: TraceInvestor }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <tr className="border-t border-subtle">
        <th scope="row" className={`${CELL} text-left font-semibold text-heading`}>
          {investor.companyName}
        </th>
        <td className={`${CELL} text-muted`}>
          {investor.buyBoxes.map((box) => `${box.name} v${box.version}`).join(", ")}
        </td>
        <td className={CELL}>
          <StatusChip tone="open">Matched</StatusChip>
        </td>
        <td className={CELL}>
          <Notification notification={investor.notification} />
        </td>
        <td className={CELL}>
          {investor.offer ? (
            <div className="flex flex-wrap items-center gap-inline-sm">
              <span>Offer {formatUsd(investor.offer.price)}</span>
              <StatusChip tone={OFFER_STATUS_TONES[investor.offer.status]}>
                {OFFER_STATUS_LABELS[investor.offer.status]}
              </StatusChip>
            </div>
          ) : (
            "None"
          )}
        </td>
        <td className={`${CELL} whitespace-nowrap pr-0 text-right`}>
          <ExplainToggle
            label="Why matched?"
            open={open}
            panelId={panelId}
            onToggle={() => setOpen(!open)}
          />
        </td>
      </tr>
      <tr id={panelId} hidden={!open}>
        <td colSpan={6} className="pb-inset-md">
          {open && (
            <MatchExplanation
              packageId={packageId}
              investorId={investor.investorId}
              companyName={investor.companyName}
            />
          )}
        </td>
      </tr>
    </>
  );
}

function MatchedTable({ trace }: { trace: PackageTrace }) {
  if (trace.matched.length === 0) {
    return <p className="text-body text-muted">No investor matched this package.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-3xl border-collapse">
        <caption className="sr-only">Matched investors, their notice, and their response</caption>
        <thead>
          <tr>
            <th scope="col" className={HEAD}>
              Investor
            </th>
            <th scope="col" className={HEAD}>
              Buy boxes
            </th>
            <th scope="col" className={HEAD}>
              Match
            </th>
            <th scope="col" className={HEAD}>
              Notification
            </th>
            <th scope="col" className={HEAD}>
              Response
            </th>
            <th scope="col" className={HEAD}>
              <span className="sr-only">Explanation</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {trace.matched.map((investor) => (
            <MatchedRow
              key={investor.investorId}
              packageId={trace.package.id}
              investor={investor}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExcludedItem({
  packageId,
  investor,
}: {
  packageId: string;
  investor: PackageTrace["excluded"][number];
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li className="flex flex-col gap-stack-sm border-t border-subtle py-inset-sm">
      <div className="flex flex-wrap items-center justify-between gap-inline-md">
        <span className="text-body font-semibold text-heading">{investor.companyName}</span>
        <ExplainToggle
          label="Why not matched?"
          open={open}
          panelId={panelId}
          onToggle={() => setOpen(!open)}
        />
      </div>
      <div id={panelId} hidden={!open}>
        {open && (
          <MatchExplanation
            packageId={packageId}
            investorId={investor.investorId}
            companyName={investor.companyName}
          />
        )}
      </div>
    </li>
  );
}

function ExcludedList({ trace }: { trace: PackageTrace }) {
  if (trace.excluded.length === 0) {
    return <p className="text-body text-muted">Every active investor matched this package.</p>;
  }
  return (
    <ul aria-label="Investors not matched" className="flex flex-col">
      {trace.excluded.map((investor) => (
        <ExcludedItem key={investor.investorId} packageId={trace.package.id} investor={investor} />
      ))}
    </ul>
  );
}

export function TraceInvestors({ trace }: { trace: PackageTrace }) {
  const [view, setView] = useState<View>("matched");
  return (
    <Card
      title="Investors"
      actions={
        <SegmentedControl label="Show investors" segments={VIEWS} value={view} onChange={setView} />
      }
    >
      {view === "matched" ? <MatchedTable trace={trace} /> : <ExcludedList trace={trace} />}
      <p className="text-helper text-muted">
        Each match records the listing version and buy box version it used, so a result can be
        replayed.
      </p>
    </Card>
  );
}
