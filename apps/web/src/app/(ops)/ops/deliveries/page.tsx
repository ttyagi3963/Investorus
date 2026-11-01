// The operations console's failed-jobs page (T342; FR-071): the deliveries by status with a retry for
// each one that needs attention, plus "Retry all" and "Send digests now". The status filter reads the
// address, so it waits behind a Suspense boundary while the page is prerendered.
import { Suspense } from "react";
import { DeliveriesScreen } from "@/features/ops/DeliveriesScreen";
import { BulkActions } from "@/features/ops/OpsActions";
import { PageHeader } from "@/features/shell/PageHeader";

export default function DeliveriesPage() {
  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Emails, texts, and CRM updates waiting in the outbox. Failed ones are retried automatically; after the last attempt they need attention here."
        actions={<BulkActions retryLabel="Retry all" digests />}
      />
      <Suspense fallback={<p role="status">Loading the deliveries…</p>}>
        <DeliveriesScreen />
      </Suspense>
    </>
  );
}
