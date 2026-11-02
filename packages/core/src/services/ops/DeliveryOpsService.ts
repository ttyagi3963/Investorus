// Operations' view of outside deliveries (T341; FR-071): the newest deliveries, optionally by
// status, each named by its investor's company or "CRM"; a retry of one delivery set aside, or of
// every one (optionally only one target's or one package's, reset in one statement, T386). A retry
// sends the delivery back to PENDING with no attempts and off the queue; the worker's relay queues
// it again. Each retry is audited.
import type { Actor } from "@clever/contracts/auth";
import { BusinessRuleError, NotFoundError } from "@clever/contracts/common";
import {
  deliveryListQuerySchema,
  retryAllInputSchema,
  type DeliveryView,
} from "@clever/contracts/ops";
import type { IUnitOfWork, UnitOfWorkRepositories } from "../../unit-of-work/IUnitOfWork.js";
import { assertOps } from "./assert-ops.js";

const LIST_LIMIT = 200;

export interface IDeliveryOpsService {
  list(actor: Actor, query: unknown): Promise<DeliveryView[]>;
  retry(actor: Actor, deliveryId: string): Promise<void>;
  retryAll(actor: Actor, input: unknown): Promise<{ count: number }>;
}

export class DeliveryOpsService implements IDeliveryOpsService {
  constructor(private readonly uow: IUnitOfWork) {}

  async list(actor: Actor, query: unknown): Promise<DeliveryView[]> {
    assertOps(actor);
    const { status } = deliveryListQuerySchema.parse(query);
    return this.uow.run(async (repos) => {
      const rows = await repos.opsQuery.listDeliveries({ status }, LIST_LIMIT);
      const companies = await repos.investors.findCompanyNames(
        rows.flatMap((d) => (d.investorId ? [d.investorId] : [])),
      );
      return rows.map((d) => ({
        id: d.id,
        target: d.target,
        recipient: d.investorId ? (companies.get(d.investorId) ?? "An investor") : "CRM",
        packageId: d.packageId,
        eventType: d.eventType,
        status: d.status,
        attempts: d.attempts,
        lastError: d.lastError,
        nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        sentAt: d.sentAt?.toISOString() ?? null,
      }));
    });
  }

  async retry(actor: Actor, deliveryId: string): Promise<void> {
    assertOps(actor);
    await this.uow.run(async (repos) => {
      if (!(await repos.deliveries.findWithEvent(deliveryId))) {
        throw new NotFoundError("Delivery not found");
      }
      if (!(await repos.deliveries.resetForRetry(deliveryId))) {
        throw new BusinessRuleError(
          "Only a delivery that needs attention can be retried",
          "DELIVERY_NOT_SET_ASIDE",
        );
      }
      await this.audit(repos, actor, deliveryId, { deliveries: 1 });
    });
  }

  async retryAll(actor: Actor, input: unknown): Promise<{ count: number }> {
    assertOps(actor);
    const { target, packageId } = retryAllInputSchema.parse(input);
    return this.uow.run(async (repos) => {
      // One statement, so a backlog of any size resets well inside the transaction's time limit.
      const count = await repos.deliveries.resetAllForRetry({ target, packageId });
      if (count > 0) {
        await this.audit(repos, actor, packageId ?? "all", {
          deliveries: count,
          target,
          packageId,
        });
      }
      return { count };
    });
  }

  private audit(
    repos: UnitOfWorkRepositories,
    actor: Actor,
    entityId: string,
    details: Record<string, unknown>,
  ) {
    return repos.audit.append({
      actorType: "USER",
      actorId: actor.userId,
      action: "DELIVERY_RETRIED",
      entityType: "Delivery",
      entityId,
      outcome: "SUCCESS",
      details,
    });
  }
}
