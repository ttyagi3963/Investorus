// The operations console's outage page (T342; FR-075): switch each stand-in service between up,
// down, slow, and garbage, to show that agents and investors keep working and deliveries catch up.
import { SimulationCards } from "@/features/ops/SimulationCards";
import { PageHeader } from "@/features/shell/PageHeader";

export default function SimulationsPage() {
  return (
    <>
      <PageHeader
        title="Simulated outages"
        description="Break a stand-in service on purpose. Agents and investors keep working; messages wait in the outbox and are retried until the service is back."
      />
      <SimulationCards />
    </>
  );
}
