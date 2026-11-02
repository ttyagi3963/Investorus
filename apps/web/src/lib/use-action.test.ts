// Guards useAction's one-at-a-time rule (T381): a second press while an action runs, even before
// the screen has re-rendered to disable the button, starts nothing.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAction } from "./use-action";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe("useAction", () => {
  it("starts one action at a time", async () => {
    let finish: () => void = () => {};
    const first = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const second = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useAction("Failed", ["x"]), { wrapper });

    await act(async () => {
      result.current.run(first);
      result.current.run(second);
    });
    await act(async () => finish());
    await waitFor(() => expect(result.current.isBusy).toBe(false));
    await act(async () => result.current.run(second));

    expect(first).toHaveBeenCalledTimes(1);
    // Only the press after the first action finished started the second.
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
  });
});
