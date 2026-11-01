// The operations console's packages page (T342; FR-073): every package with its status, matches,
// offers, and delivery trouble, each opening its trace. The console's landing page.
import { PackagesTable } from "@/features/ops/PackagesTable";
import { PageHeader } from "@/features/shell/PageHeader";

export default function OpsPackagesPage() {
  return (
    <>
      <PageHeader
        title="Packages"
        description="Every listing package, with what matched, what was sent, and what needs attention."
      />
      <PackagesTable />
    </>
  );
}
