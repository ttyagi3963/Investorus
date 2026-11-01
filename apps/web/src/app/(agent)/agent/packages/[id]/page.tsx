"use client";
// The edit package page (T270): loads the agent's package, shows the form filled in, and the photo
// section. A package that is not the agent's comes back as not found from the api.
import { useParams } from "next/navigation";
import Link from "next/link";
import { PackageForm } from "@/features/listing-package/PackageForm";
import { PhotoSection } from "@/features/listing-package/PhotoSection";
import { usePackage } from "@/features/listing-package/queries";

export default function EditPackagePage() {
  const { id } = useParams<{ id: string }>();
  const { data: pkg, isPending, isError, error } = usePackage(id);

  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <Link href="/agent" className="text-label text-link underline">
        Back to your packages
      </Link>
      {isPending && <p role="status">Loading the package…</p>}
      {isError && (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      )}
      {pkg && (
        <>
          <h1 className="font-heading text-heading-lg">{pkg.property.streetLine}</h1>
          <PackageForm existing={pkg} />
          <PhotoSection pkg={pkg} />
        </>
      )}
    </div>
  );
}
