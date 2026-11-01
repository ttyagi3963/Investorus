// Switches a stand-in outside service's simulated outage (T341; FR-075): each of the CRM, messaging,
// and storage can be up, down, slow, or answer garbage. The prototype's sandbox is the only
// implementation; production has no simulation.
import type { SimulationMode, SimulationModes, SimulationService } from "@clever/contracts/ops";

export interface ISimulationControlProvider {
  get(): Promise<SimulationModes>;
  set(service: SimulationService, mode: SimulationMode): Promise<SimulationModes>;
}
