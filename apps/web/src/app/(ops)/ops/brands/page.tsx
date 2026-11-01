// The operations theme editor page (T353; FR-093): edit or upload a brand's token file; a saved file
// changes every page in that brand at once.
import { BrandEditor } from "@/features/ops/BrandEditor";
import { PageHeader } from "@/features/shell/PageHeader";

export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="Change a brand's colors, type, and shapes. A file that is missing a variable or has unreadable text is refused, with each problem listed."
      />
      <BrandEditor />
    </>
  );
}
