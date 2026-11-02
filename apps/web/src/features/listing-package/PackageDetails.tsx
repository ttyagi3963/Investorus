// The package's details as text, for a package whose details can no longer change (T375): from an
// accepted offer on, after a fall-through, and once closed or withdrawn. It says why, in place of
// the form, so the agent is not offered edits the api would refuse.
import type { AgentPackageView, PackageStatus } from "@clever/contracts/listing-package";
import { Card } from "@clever/ui";
import { CONDITION_LABELS, formatUsd, PROGRAM_LABELS, PROPERTY_TYPE_LABELS } from "./labels";

/** Why the details are fixed, by status. */
function reason(status: PackageStatus): string {
  if (status === "FELL_THROUGH") {
    return "The deal fell through. Reopen the package to change its details or photos.";
  }
  if (status === "CLOSED" || status === "WITHDRAWN") {
    return "This package has ended, so its details and photos can no longer change.";
  }
  return "An offer is accepted, so the details the buyer agreed to can no longer change.";
}

export function PackageDetails({ pkg }: { pkg: AgentPackageView }) {
  const p = pkg.property;
  const facts: [string, string | number | null][] = [
    ["Seller", pkg.seller.fullName],
    ["Seller email", pkg.seller.email],
    ["Seller phone", pkg.seller.phone],
    ["Street address", `${p.streetLine}, ${p.city}, ${p.state} ${p.zip}`],
    ["Neighborhood", p.neighborhood],
    ["Type", PROPERTY_TYPE_LABELS[p.propertyType]],
    ["Beds", p.beds],
    ["Baths", p.baths],
    ["Square feet", p.sqft],
    ["Lot square feet", p.lotSqft],
    ["Units", p.units],
    ["Year built", p.yearBuilt],
    ["Condition", p.condition && CONDITION_LABELS[p.condition]],
    ["Repair estimate", p.repairEstimate === null ? null : formatUsd(p.repairEstimate)],
    [
      "Seller expects",
      `${formatUsd(pkg.priceExpectationMin)} to ${formatUsd(pkg.priceExpectationMax)}`,
    ],
    [
      "Closing window",
      pkg.closingWindowStart && `${pkg.closingWindowStart} to ${pkg.closingWindowEnd}`,
    ],
    [
      "Listed for sale now",
      pkg.currentlyListed === null ? null : pkg.currentlyListed ? "Yes" : "No",
    ],
    ["Programs", pkg.eligiblePrograms.map((id) => PROGRAM_LABELS[id]).join(", ")],
  ];
  return (
    <Card title="Package details" description={reason(pkg.status)}>
      <dl className="grid grid-cols-1 gap-stack-md sm:grid-cols-2 lg:grid-cols-3">
        {facts
          .filter(([, value]) => value !== null && value !== "")
          .map(([name, value]) => (
            <div key={name} className="flex flex-col gap-stack-xs">
              <dt className="text-label text-muted">{name}</dt>
              <dd className="text-body-lg text-default">{value}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}
