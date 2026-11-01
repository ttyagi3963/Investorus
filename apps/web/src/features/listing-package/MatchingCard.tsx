// The package page's matching card (T330, T343; design 04): how many investors the package matched in
// its current round as a large figure, how many eligible buy boxes the last run weighed, and the
// criteria the others failed most often, each with a bar sized to its share. Counts only; the bars
// are decoration, since each count is also written out. A draft has not been matched yet.
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Card } from "@clever/ui";

export function MatchingCard({ pkg }: { pkg: AgentPackageView }) {
  const summary = pkg.matchSummary;
  return (
    <Card title="Matching">
      {pkg.status === "DRAFT" ? (
        <p className="text-body text-muted">Matching runs when the package is published.</p>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-inline-sm">
            <span className="font-heading text-display font-semibold text-accent">
              {pkg.matchedCount}
            </span>
            <span className="text-body text-muted">
              {pkg.matchedCount === 1 ? "investor" : "investors"} matched
              {summary && ` from ${summary.evaluated} active buy boxes`}
            </span>
          </p>
          {summary && summary.reasons.length > 0 && (
            <div className="flex flex-col gap-stack-sm">
              <h3 className="text-label text-default">Top reasons a buy box didn&apos;t match</h3>
              <ul className="flex flex-col gap-stack-sm">
                {summary.reasons.map((reason) => (
                  <li key={reason.key} className="flex flex-col gap-stack-xs">
                    <span className="flex justify-between gap-inline-md text-body">
                      <span>{reason.label}</span>
                      <span className="font-semibold">{reason.count}</span>
                    </span>
                    <span aria-hidden="true" className="h-2 overflow-hidden rounded-pill bg-soft">
                      <span
                        className="block h-full rounded-pill bg-action-primary"
                        style={{ width: `${(reason.count / summary.evaluated) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
