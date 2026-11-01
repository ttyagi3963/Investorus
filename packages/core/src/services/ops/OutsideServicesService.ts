// Operations and the stand-in outside services (T341; FR-075, FR-078): the CRM's record of each
// listing beside the platform's status, where every difference is explained by a CRM delivery not
// yet sent; and the simulated outage of each service, read and switched (the switch is audited).
import type { Actor } from "@clever/contracts/auth";
import {
  SIMULATION_SERVICES,
  simulationInputSchema,
  type CrmComparisonRow,
  type SimulationModes,
} from "@clever/contracts/ops";
import { NotFoundError } from "@clever/contracts/common";
import type { ICrmMirrorReader } from "../../providers/crm/ICrmMirrorReader.js";
import type { ISimulationControlProvider } from "../../providers/simulation/ISimulationControlProvider.js";
import type { IUnitOfWork } from "../../unit-of-work/IUnitOfWork.js";
import { assertOps } from "./assert-ops.js";

export interface IOutsideServicesService {
  crmComparison(actor: Actor): Promise<CrmComparisonRow[]>;
  simulations(actor: Actor): Promise<SimulationModes>;
  setSimulation(actor: Actor, service: string, input: unknown): Promise<SimulationModes>;
}

export class OutsideServicesService implements IOutsideServicesService {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly deps: { crm: ICrmMirrorReader; simulation: ISimulationControlProvider },
  ) {}

  async crmComparison(actor: Actor): Promise<CrmComparisonRow[]> {
    assertOps(actor);
    const crm = new Map((await this.deps.crm.listListings()).map((r) => [r.packageId, r]));
    return this.uow.run(async (repos) => {
      const rows: CrmComparisonRow[] = [];
      for (const pkg of await repos.opsQuery.listPackages()) {
        // A draft has never been published, so the CRM has no copy to compare.
        if (pkg.status === "DRAFT") continue;
        const record = crm.get(pkg.id);
        const unsent = (await repos.opsQuery.deliveriesForPackage(pkg.id)).findLast(
          (d) => d.target === "CRM" && d.status !== "SENT",
        );
        rows.push({
          packageId: pkg.id,
          streetLine: pkg.streetLine,
          platformStatus: pkg.status,
          crmStatus: record?.status ?? null,
          inSync: record?.status === pkg.status,
          pendingDelivery: unsent ? { id: unsent.id, status: unsent.status } : null,
        });
      }
      return rows;
    });
  }

  async simulations(actor: Actor): Promise<SimulationModes> {
    assertOps(actor);
    return this.deps.simulation.get();
  }

  async setSimulation(actor: Actor, service: string, input: unknown): Promise<SimulationModes> {
    assertOps(actor);
    const known = SIMULATION_SERVICES.find((s) => s === service);
    if (!known) throw new NotFoundError("No such outside service");
    const { mode } = simulationInputSchema.parse(input);
    const modes = await this.deps.simulation.set(known, mode);
    await this.uow.run((repos) =>
      repos.audit.append({
        actorType: "USER",
        actorId: actor.userId,
        action: "SIMULATION_CHANGED",
        entityType: "Simulation",
        entityId: known,
        outcome: "SUCCESS",
        details: { mode },
      }),
    );
    return modes;
  }
}
