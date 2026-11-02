// Setup shortcuts through the web app's BFF (T411), for steps a spec needs but does not test, where
// the UI would only add minutes. Each call uses the signed-in browser context's own cookie, and
// sends what the browser's client sends: the page's Origin (the BFF's CSRF check) and an
// Idempotency-Key on every change (the api requires one).
import { randomUUID } from "node:crypto";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import type { BuyBoxInput, BuyBoxView } from "@clever/contracts/buy-box";
import type { DealView } from "@clever/contracts/deal";
import type {
  AgentPackageView,
  CreateListingPackageInput,
} from "@clever/contracts/listing-package";
import type { CreateOfferInput, OfferView } from "@clever/contracts/offer";
import type { PhotoUpload } from "@clever/contracts/photo";
import type { SimulationMode, SimulationService } from "@clever/contracts/ops";
import { JPEG } from "./data.js";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class Bff {
  constructor(
    private readonly request: APIRequestContext,
    private readonly origin: string,
  ) {}

  /** The raw answer, for a spec that checks a refusal. */
  send(method: Method, path: string, body?: unknown): Promise<APIResponse> {
    const headers: Record<string, string> = { Origin: this.origin };
    if (method !== "GET" && method !== "DELETE") headers["Idempotency-Key"] = randomUUID();
    return this.request.fetch(`${this.origin}/bff${path}`, { method, headers, data: body });
  }

  async call<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const response = await this.send(method, path, body);
    if (!response.ok()) {
      throw new Error(`${method} ${path} answered ${response.status()}: ${await response.text()}`);
    }
    return (response.status() === 204 ? undefined : await response.json()) as T;
  }

  createPackage(input: CreateListingPackageInput) {
    return this.call<AgentPackageView>("POST", "/listing-packages", input);
  }

  getPackage(id: string) {
    return this.call<AgentPackageView>("GET", `/listing-packages/${id}`);
  }

  /** Uploads the JPEG and attaches it as the package's first photo. */
  async addPhoto(packageId: string) {
    const storageKey = await this.uploadPhoto(packageId);
    await this.call("POST", `/listing-packages/${packageId}/photos`, { storageKey, position: 0 });
  }

  /** Uploads the JPEG with the api's signed instruction, straight to storage; returns its key. */
  async uploadPhoto(packageId: string): Promise<string> {
    const { storageKey, upload } = await this.call<PhotoUpload>(
      "POST",
      `/listing-packages/${packageId}/photo-uploads`,
      { contentType: JPEG.mimeType, sizeBytes: JPEG.buffer.length },
    );
    const stored = await this.request.fetch(upload.url, {
      method: upload.method,
      headers: upload.headers,
      data: JPEG.buffer,
    });
    if (!stored.ok()) throw new Error(`The photo upload answered ${stored.status()}`);
    return storageKey;
  }

  /** Publishes a draft; without a deadline the api gives the default offer window. */
  async publish(packageId: string, offerDeadline?: Date) {
    const { version } = await this.getPackage(packageId);
    return this.call<AgentPackageView>("POST", `/listing-packages/${packageId}/publication`, {
      version,
      ...(offerDeadline && { offerDeadline: offerDeadline.toISOString() }),
    });
  }

  /** A draft with a photo, published: the agent's side of every investor journey. */
  async publishedPackage(input: CreateListingPackageInput, offerDeadline?: Date) {
    const draft = await this.createPackage(input);
    await this.addPhoto(draft.id);
    return this.publish(draft.id, offerDeadline);
  }

  deal(packageId: string) {
    return this.call<DealView>("GET", `/listing-packages/${packageId}/deal`);
  }

  createBuyBox(input: BuyBoxInput) {
    return this.call<BuyBoxView>("POST", "/investor/buy-boxes", input);
  }

  /** The investor's view of a package: 404 until matching has shared it with them. */
  investorPackage(packageId: string) {
    return this.send("GET", `/investor/packages/${packageId}`);
  }

  makeOffer(packageId: string, terms: CreateOfferInput) {
    return this.call<OfferView>("POST", `/listing-packages/${packageId}/offers`, terms);
  }

  packageOffers(packageId: string) {
    return this.call<OfferView[]>("GET", `/listing-packages/${packageId}/offers`);
  }

  setSimulation(service: SimulationService, mode: SimulationMode) {
    return this.call("PUT", `/ops/simulations/${service}`, { mode });
  }
}
