// The operations console's CRM page (T342; FR-077, FR-078): each package's platform status beside
// the stand-in CRM's record, with the delivery that explains any difference.
import { CrmComparison } from "@/features/ops/CrmComparison";
import { PageHeader } from "@/features/shell/PageHeader";

export default function CrmPage() {
  return (
    <>
      <PageHeader
        title="CRM comparison"
        description="The platform is the source of truth; the CRM only receives updates. Any difference is explained by a delivery that has not been sent yet."
      />
      <CrmComparison />
    </>
  );
}
