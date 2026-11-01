"use client";
// The package page (T270, T301): loads the agent's package and shows its status with Publish or
// Withdraw, the form filled in, the photos, the offers, and the timeline. A package that is not the
// agent's comes back as not found from the api.
import { useParams } from "next/navigation";
import Link from "next/link";
import { ErrorNotice } from "@/features/errors/ErrorNotice";
import { OffersAndTimeline } from "@/features/listing-package/OffersAndTimeline";
import { PackageForm } from "@/features/listing-package/PackageForm";
import { PhotoSection } from "@/features/listing-package/PhotoSection";
import { PublishPanel } from "@/features/listing-package/PublishPanel";
import { usePackage } from "@/features/listing-package/queries";
import { describeError } from "@/lib/errors";

export default function EditPackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isPending, isError, error } = usePackage(id);

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href="/agent" className="text-label text-link underline">
        Back to your packages
      </Link>
      {isPending && <p role="status">Loading the package…</p>}
      {isError && <ErrorNotice error={describeError(error, "The package could not be loaded.")} />}
      {pkg && (
        <>
          <h1 className="font-heading text-heading-lg">{pkg.property.streetLine}</h1>
          <PublishPanel pkg={pkg} />
          {/* The key reloads the form after a publish or an edit, so it shows the saved values. */}
          <PackageForm key={pkg.version} existing={pkg} />
          <PhotoSection pkg={pkg} />
          <OffersAndTimeline pkg={pkg} />
        </>
      )}
    </div>
  );
}
