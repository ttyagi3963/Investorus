// Guards the save-then-list handoff (T422): saving changes sends the agent to the listings page, so
// the list cached from before the edit must already carry the saved version by then. Otherwise the
// row's Publish sends the old version and the api refuses it as a stale edit (409).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { packageKeys, usePackages } from "./queries";
import { useSavePackage } from "./useSavePackage";

const update = vi.fn();
const list = vi.fn();
vi.mock("../../lib/bff-client", () => ({
  listingPackages: {
    update: (...args: unknown[]) => update(...args),
    list: (...args: unknown[]) => list(...args),
  },
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock("@clever/ui", () => ({ showToast: vi.fn() }));

describe("useSavePackage", () => {
  it("refreshes the listings page's cached list before sending the agent there", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    // The agent opens the package from the list, which is then cached and off screen.
    list.mockResolvedValueOnce([{ id: "p1", version: 5 }]);
    const listPage = renderHook(() => usePackages(), { wrapper });
    await waitFor(() => expect(listPage.result.current.data).toBeDefined());
    listPage.unmount();
    update.mockResolvedValue({ id: "p1", version: 6, property: { streetLine: "12 Elm St" } });
    list.mockResolvedValue([{ id: "p1", version: 6 }]);
    let listWhenSent: unknown;
    push.mockImplementation(() => (listWhenSent = client.getQueryData(packageKeys.all)));
    const { result } = renderHook(() => useSavePackage(), { wrapper });

    act(() => result.current.save({ mode: "update", id: "p1", input: { version: 5 } }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/agent"));
    expect(listWhenSent).toEqual([{ id: "p1", version: 6 }]);
  });
});
