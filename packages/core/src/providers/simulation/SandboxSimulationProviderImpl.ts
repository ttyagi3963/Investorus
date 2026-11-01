// The sandbox's outage switches and CRM read-out for the api (T341; contracts/providers.md):
// GET /simulation, PUT /simulation/:service (with the internal token), and GET /crm/listings. Every
// answer is checked with Zod; a sandbox that is down or garbled becomes an InfrastructureError.
import {
  SIMULATION_MODES,
  type SimulationMode,
  type SimulationService,
} from "@clever/contracts/ops";
import { z } from "zod";
import { InfrastructureError } from "../../errors/InfrastructureError.js";
import type { CrmMirrorRecord, ICrmMirrorReader } from "../crm/ICrmMirrorReader.js";
import { sandboxRequest } from "../sandbox-http.js";
import type { ISimulationControlProvider } from "./ISimulationControlProvider.js";

const modes = z.object({
  crm: z.enum(SIMULATION_MODES),
  messaging: z.enum(SIMULATION_MODES),
  storage: z.enum(SIMULATION_MODES),
});
const listings = z.object({
  listings: z.array(
    z.object({ packageId: z.string(), status: z.string(), occurredAt: z.coerce.date() }),
  ),
});

export class SandboxSimulationProviderImpl implements ISimulationControlProvider, ICrmMirrorReader {
  private readonly fetch: typeof globalThis.fetch;

  constructor(
    private readonly options: {
      internalUrl: string;
      internalToken: string;
      fetch?: typeof globalThis.fetch;
    },
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  get() {
    return this.read("/simulation", modes);
  }

  set(service: SimulationService, mode: SimulationMode) {
    return this.read(`/simulation/${service}`, modes, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-sandbox-token": this.options.internalToken,
      },
      body: JSON.stringify({ mode }),
    });
  }

  async listListings(): Promise<CrmMirrorRecord[]> {
    return (await this.read("/crm/listings", listings)).listings;
  }

  private async read<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const res = await sandboxRequest(this.fetch, `${this.options.internalUrl}${path}`, init);
    const parsed = schema.safeParse(await res.json().catch(() => undefined));
    if (!res.ok || !parsed.success) {
      throw new InfrastructureError(`The sandbox sent an unusable answer to ${path}`, 502);
    }
    return parsed.data;
  }
}
