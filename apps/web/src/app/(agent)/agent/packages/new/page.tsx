// The new package page (T270): the package form with nothing filled in. Saving creates the draft
// and opens its edit page, where photos can be added.
import { PackageForm } from "@/features/listing-package/PackageForm";

export default function NewPackagePage() {
  return (
    <div className="flex max-w-3xl flex-col gap-stack-lg">
      <h1 className="font-heading text-heading-lg">New package</h1>
      <PackageForm />
    </div>
  );
}
