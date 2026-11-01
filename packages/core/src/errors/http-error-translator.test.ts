// Guards the error rules (constitution VII, XII): bad input names its fields, expected errors keep
// their status and are not reported, and nothing unexpected leaks internals to the caller.
import { BusinessRuleError, NotFoundError } from "@clever/contracts/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InfrastructureError } from "./InfrastructureError.js";
import { translateError } from "./http-error-translator.js";

const reporter = () => ({ report: vi.fn() });

describe("translateError", () => {
  it("turns a Zod error into a 400 that names each failing field", () => {
    const parsed = z
      .object({ seller: z.object({ email: z.email() }) })
      .safeParse({ seller: { email: "x" } });
    const r = reporter();
    const { status, body } = translateError(parsed.error, { reporter: r });
    expect(status).toBe(400);
    expect(body.details?.fields).toEqual([{ field: "seller.email", message: expect.any(String) }]);
    expect(r.report).not.toHaveBeenCalled();
  });

  it("keeps a domain error's status and code, without reporting it", () => {
    const r = reporter();
    expect(translateError(new NotFoundError("Package not found"), { reporter: r })).toEqual({
      status: 404,
      body: { error: "Package not found", code: "NOT_FOUND" },
    });
    const duplicate = new BusinessRuleError("Already listed", "DUPLICATE_ACTIVE_LISTING");
    expect(translateError(duplicate, { reporter: r }).status).toBe(409);
    expect(r.report).not.toHaveBeenCalled();
  });

  it("gives an infrastructure failure a generic message and reports it", () => {
    const r = reporter();
    const err = new InfrastructureError("storage timed out at http://sandbox:4100", 503);
    const { status, body } = translateError(err, { reporter: r });
    expect(status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("sandbox");
    expect(r.report).toHaveBeenCalledWith(err);
  });

  it("turns anything else into a generic 500 with no stack, path, or SQL, and reports it", () => {
    const r = reporter();
    const err = new Error('relation "User" does not exist at /app/dist/server.js:12');
    expect(translateError(err, { reporter: r })).toEqual({
      status: 500,
      body: { error: "Internal server error", code: "INTERNAL" },
    });
    expect(r.report).toHaveBeenCalledWith(err);
  });
});
