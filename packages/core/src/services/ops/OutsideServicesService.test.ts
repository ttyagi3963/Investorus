// Guards the outage switch's ordering (T381; FR-075, XII): the sandbox is switched before the audit
// transaction opens, never inside it, so no database transaction waits on an outside call, and a
// switch the sandbox refused is never audited.
import type { Actor } from "@clever/contracts/auth";
import type { SimulationModes } from "@clever/contracts/ops";
import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../../../test/doubles/InMemoryRepositories.js";
import type { ICrmMirrorReader } from "../../providers/crm/ICrmMirrorReader.js";
import { OutsideServicesService } from "./OutsideServicesService.js";

const ops: Actor = { userId: "user-ops", role: "OPS", agentId: null };
const UP: SimulationModes = { crm: "up", messaging: "up", storage: "up" };

describe("OutsideServicesService.setSimulation", () => {
  it("switches the sandbox outside any transaction, then audits the switch", async () => {
    const uow = new InMemoryUnitOfWork();
    let open = false;
    const run = uow.run.bind(uow);
    uow.run = async (work) => {
      open = true;
      try {
        return await run(work);
      } finally {
        open = false;
      }
    };
    const switchedInTransaction: boolean[] = [];
    let sandboxUp = true;
    const service = new OutsideServicesService(uow, {
      crm: {} as ICrmMirrorReader,
      simulation: {
        get: async () => UP,
        set: async (service, mode) => {
          switchedInTransaction.push(open);
          if (!sandboxUp) throw new Error("sandbox unreachable");
          return { ...UP, [service]: mode };
        },
      },
    });

    const modes = await service.setSimulation(ops, "crm", { mode: "down" });
    sandboxUp = false;
    await expect(service.setSimulation(ops, "messaging", { mode: "slow" })).rejects.toThrow();

    expect(modes.crm).toBe("down");
    expect(switchedInTransaction).toEqual([false, false]);
    expect(uow.repos.audit.entries).toEqual([
      expect.objectContaining({ action: "SIMULATION_CHANGED", entityId: "crm" }),
    ]);
  });
});
