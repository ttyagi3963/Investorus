"use client";
// Why an investor was or was not matched (T342; FR-074): loads the explanation when it is opened and
// shows each buy box with its version, whether it was paused then, and every criterion's result in
// words with what the box wanted and what the listing had. Says when the result was replayed.
import type { MatchExplanation as Explanation } from "@clever/contracts/ops";
import { StatusChip } from "@clever/ui";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { describeError } from "@/lib/errors";
import { formatCriterionValue } from "./labels";
import { useMatchExplanation } from "./queries";

const HEAD = "py-inset-xs pr-inset-md text-left text-helper font-semibold text-muted";
const CELL = "py-inset-xs pr-inset-md align-top text-body";

function BuyBoxResult({ box }: { box: Explanation["buyBoxes"][number] }) {
  return (
    <div className="flex flex-col gap-stack-sm rounded-control border border-default p-inset-md">
      <div className="flex flex-wrap items-center gap-inline-sm">
        <h3 className="text-label text-heading">
          {box.name} v{box.version}
        </h3>
        <StatusChip tone={box.matched ? "under-contract" : "error"}>
          {box.matched ? "Matched" : "Not matched"}
        </StatusChip>
        {!box.active && <StatusChip tone="draft">Paused then</StatusChip>}
      </div>
      {!box.active && (
        <p className="text-helper text-muted">
          A paused buy box matches nothing, whatever its criteria.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            {box.name} v{box.version}: each criterion and its result
          </caption>
          <thead>
            <tr className="border-b border-subtle">
              <th scope="col" className={HEAD}>
                Criterion
              </th>
              <th scope="col" className={HEAD}>
                Result
              </th>
              <th scope="col" className={HEAD}>
                Buy box wants
              </th>
              <th scope="col" className={HEAD}>
                Listing has
              </th>
            </tr>
          </thead>
          <tbody>
            {box.criteria.map((check) => (
              <tr key={check.key} className="border-b border-subtle last:border-b-0">
                <th scope="row" className={`${CELL} text-left font-medium text-heading`}>
                  {check.label}
                </th>
                <td
                  className={`${CELL} font-semibold ${check.passed ? "text-status-under-contract" : "text-status-error"}`}
                >
                  <span aria-hidden="true">{check.passed ? "✓ " : "✗ "}</span>
                  {check.passed ? "Passed" : "Failed"}
                </td>
                <td className={`${CELL} text-default`}>
                  {formatCriterionValue(check.key, check.expected, "expected")}
                </td>
                <td className={`${CELL} text-default`}>
                  {formatCriterionValue(check.key, check.actual, "actual")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MatchExplanation({
  packageId,
  investorId,
  companyName,
}: {
  packageId: string;
  investorId: string;
  companyName: string;
}) {
  const explanation = useMatchExplanation(packageId, investorId);
  const data = explanation.data;

  return (
    <div className="flex flex-col gap-stack-sm">
      {explanation.isPending && <p role="status">Loading why {companyName} was matched or not…</p>}
      {explanation.isError && (
        <ErrorNotice
          error={describeError(explanation.error, "The match explanation could not be loaded.")}
        />
      )}
      {data && (
        <>
          <p className="text-helper text-muted">
            Listing version {data.listingVersion}.{" "}
            {data.source === "REPLAYED"
              ? "Replayed with the current rules: no decision was stored for this investor."
              : "The decision stored when matching ran."}
            {data.replayedWithNewerRules &&
              " The matching rules changed since, so a replay may differ."}
          </p>
          {data.buyBoxes.length === 0 && (
            <p className="text-body text-muted">{companyName} has no buy boxes to compare.</p>
          )}
          {data.buyBoxes.map((box) => (
            <BuyBoxResult key={box.buyBoxId} box={box} />
          ))}
        </>
      )}
    </div>
  );
}
