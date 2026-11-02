// Guards the offer form's rules (T302; XX.2, FR-042): pressing submit twice sends one request, the
// api's field errors land on their fields, and "sent" lasts while the offer is as sent (T414). The
// client keeps the Idempotency-Key for a retry (T381; client/http.test.ts).
import { ApiError } from "@clever/contracts/client";
import type { CreateOfferInput, OfferView } from "@clever/contracts/offer";
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

describe("useOfferForm", () => {
  it("sends one request for a double press", async () => {
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

  it("says sent once the page holds the offer as sent, and no longer once it changes", async () => {
    makeOffer.mockReset();
    const offer = { ...terms, id: "o1", status: "ACTIVE", version: 1 } as OfferView;
    makeOffer.mockResolvedValue(offer);
    const { result, rerender } = renderHook(
      ({ myOffer }: { myOffer: OfferView | null }) => useOfferForm("p1", myOffer),
      { wrapper, initialProps: { myOffer: null as OfferView | null } },
    );
    await act(() => result.current.submit(terms));

    rerender({ myOffer: offer });
    expect(result.current.saved).toBe(true);
    rerender({ myOffer: { ...offer, status: "WITHDRAWN", version: 2 } });
    expect(result.current.saved).toBe(false);
  });
});
