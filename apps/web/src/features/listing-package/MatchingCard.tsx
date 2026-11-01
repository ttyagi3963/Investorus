// The package page's matching card (T330): how many investors the package matched in its current
// round, as a large figure; a draft has not been matched yet, so it says when matching runs.
import type { AgentPackageView } from "@clever/contracts/listing-package";
import { Card } from "@clever/ui";

export function MatchingCard({ pkg }: { pkg: AgentPackageView }) {
  return (
    <Card title="Matching">
      {pkg.status === "DRAFT" ? (
        <p className="text-body text-muted">Matching runs when the package is published.</p>
      ) : (
        <p className="flex items-baseline gap-inline-sm">
          <span className="font-heading text-display font-semibold text-accent">
            {pkg.matchedCount}
          </span>
          <span className="text-body text-muted">
            {pkg.matchedCount === 1 ? "investor" : "investors"} matched
          </span>
        </p>
      )}
    </Card>
  );
}
