"use client";
// The package page (T270, T301, T330): loads the agent's package and shows the header with its
// status and actions, then, in two columns on wide screens, the photos and the form on the left and
// the matching, offers, and activity cards on the right. A package that is not the agent's comes
// back as not found from the api.
import { useParams } from "next/navigation";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { MatchingCard } from "@/features/listing-package/MatchingCard";
import { PackageActivity, PackageOffers } from "@/features/listing-package/OffersAndTimeline";
import { PackageForm } from "@/features/listing-package/PackageForm";
import { PhotoSection } from "@/features/listing-package/PhotoSection";
import { PublishPanel } from "@/features/listing-package/PublishPanel";
import { usePackage } from "@/features/listing-package/queries";
import { PageHeader } from "@/features/shell/PageHeader";
import { describeError } from "@/lib/errors";

export default function EditPackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isPending, isError, error } = usePackage(id);

  if (!pkg) {
    return (
      <>
        <PageHeader title="Listing package" back={{ href: "/agent", label: "Listing packages" }} />
        {isPending && <p role="status">Loading the package…</p>}
        {isError && (
          <ErrorNotice error={describeError(error, "The package could not be loaded.")} />
        )}
      </>
    );
  }

  return (
    <>
      <PublishPanel pkg={pkg} />
      <div className="grid items-start gap-stack-lg lg:grid-cols-3">
        <div className="flex flex-col gap-stack-lg lg:col-span-2">
          <PhotoSection pkg={pkg} />
          {/* The key reloads the form after a publish or an edit, so it shows the saved values. */}
          <PackageForm key={pkg.version} existing={pkg} />
        </div>
        <div className="flex flex-col gap-stack-lg">
          <MatchingCard pkg={pkg} />
          <PackageOffers pkg={pkg} />
          <PackageActivity pkg={pkg} />
        </div>
      </div>
    </>
  );
}
