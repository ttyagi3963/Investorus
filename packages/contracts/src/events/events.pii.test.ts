// Guards the outbox privacy rule (T336; FR-032): no event schema has a field for a seller's name,
// contact details, or street, so seller PII can never be queued for an outside service. The CRM
// target adds the seller's contact itself, at send time.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { outboxEventInputSchema } from "./events.js";

const FORBIDDEN = ["fullName", "sellerName", "email", "phone", "streetLine", "sellerContact"];

/** Every property name anywhere in a JSON Schema. */
function propertyNames(schema: unknown): string[] {
  if (Array.isArray(schema)) return schema.flatMap(propertyNames);
  if (typeof schema !== "object" || schema === null) return [];
  const own = "properties" in schema ? Object.keys(schema.properties as object) : [];
  return [...own, ...Object.values(schema).flatMap(propertyNames)];
}

describe("outbox events", () => {
  it("have no field that could carry seller PII", () => {
    const names = propertyNames(z.toJSONSchema(outboxEventInputSchema));
    expect(names).toContain("investorId");
    expect(names.filter((name) => FORBIDDEN.includes(name))).toEqual([]);
  });
});
