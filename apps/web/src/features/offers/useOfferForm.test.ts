// Guards the offer form's rules (T302; XX.2, FR-042): pressing submit twice sends one request; the
// action carries one Idempotency-Key, which a retry after a lost answer reuses, so the offer is made
// once; and the api's field errors land on their fields.
import { ApiError } from "@clever/contracts/client";
import type { CreateOfferInput } from "@clever/contracts/offer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useOfferForm } from "./useOfferForm";

const makeOffer = vi.fn();
vi.mock("../../lib/bff-client", () => ({
  investor: {
    makeOffer: (...args: unknown[]) => makeOffer(...args),
    reviseOffer: vi.fn(),
  },
}));

const terms: CreateOfferInput = {
  price: 280_000,
  paymentType: "CASH",
  closingDate: "2026-12-01",
  earnestMoney: 5_000,
  contingencies: [],
  feesAndConcessions: 0,
  expiresAt: "2026-11-03T12:00:00Z",
};
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);
const keyOf = (call: number) =>
  (makeOffer.mock.calls[call] as [string, unknown, { idempotencyKey: string }])[2].idempotencyKey;

describe("useOfferForm", () => {
  it("sends one request for a double press, and reuses its key when retrying a lost answer", async () => {
    makeOffer.mockReset();
    let finish: (value: unknown) => void = () => {};
    makeOffer.mockReturnValueOnce(new Promise((_, reject) => (finish = reject)));
    const { result } = renderHook(() => useOfferForm("p1", null), { wrapper });

    await act(async () => {
      void result.current.submit(terms);
      void result.current.submit(terms);
      finish(new TypeError("Failed to fetch"));
    });
    expect(makeOffer).toHaveBeenCalledTimes(1);

    makeOffer.mockResolvedValueOnce({ id: "o1" });
    await act(() => result.current.submit(terms));
    expect(makeOffer).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
    expect(keyOf(0)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("puts the api's field errors on their fields", async () => {
    makeOffer.mockReset();
    makeOffer.mockRejectedValue(
      new ApiError(400, {
        error: "Some fields are invalid",
        code: "VALIDATION_FAILED",
        details: { fields: [{ field: "closingDate", message: "Cannot be in the past" }] },
      }),
    );
    const { result } = renderHook(() => useOfferForm("p1", null), { wrapper });
    await act(() => result.current.submit(terms));
    expect(result.current.fieldErrors).toEqual({ closingDate: "Cannot be in the past" });
  });
});
