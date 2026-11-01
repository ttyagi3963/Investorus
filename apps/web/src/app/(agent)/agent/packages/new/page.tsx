// The new package page (T270, T330): the package form with nothing filled in, under a header that
// links back to the list. Saving creates the draft and opens its page, where photos can be added.
import { PackageForm } from "@/features/listing-package/PackageForm";
import { PageHeader } from "@/features/shell/PageHeader";

export default function NewPackagePage() {
  return (
    <>
      <PageHeader
        title="New listing package"
        back={{ href: "/agent", label: "Listing packages" }}
      />
      <div className="lg:w-3/4">
        <PackageForm />
      </div>
    </>
  );
}
