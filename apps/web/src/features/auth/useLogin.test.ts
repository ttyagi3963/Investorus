// Guards the login form's rules (T097, T300, T358): pressing sign in twice sends one request, a
// successful sign-in forgets the earlier user's cached data and goes to the home of the user's
// role, and a refused one shows the api's message and the request ID, and stays put.
import { ApiError } from "@clever/contracts/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useLogin } from "./useLogin";

const replace = vi.fn();
const signIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../../lib/bff-client", () => ({ session: { signIn: (input: unknown) => signIn(input) } }));

const demo = { email: "avery@example.com", password: "demo1234" };
const queryClient = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

describe("useLogin", () => {
  it("signs in once however often it is pressed, then goes to the home of the user's role", async () => {
    let finish: (value: unknown) => void = () => {};
    signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    queryClient.setQueryData(["listing-packages"], ["an earlier user's package"]);
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(async () => {
      void result.current.submit(demo);
      void result.current.submit(demo);
      finish({ user: { role: "AGENT" } });
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/agent");
    expect(queryClient.getQueryData(["listing-packages"])).toBeUndefined();

    signIn.mockResolvedValue({ user: { role: "INVESTOR" } });
    const investor = renderHook(() => useLogin(), { wrapper });
    await act(() => investor.result.current.submit(demo));
    expect(replace).toHaveBeenLastCalledWith("/investor");
  });

  it("shows the api's message and the request ID when the sign-in is refused, and stays put", async () => {
    signIn.mockRejectedValue(
      new ApiError(400, { error: "Invalid email or password", requestId: "trace-1" }),
    );
    const { result } = renderHook(() => useLogin(), { wrapper });

    await act(() => result.current.submit(demo));

    expect(result.current.error).toEqual({
      message: "Invalid email or password",
      requestId: "trace-1",
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
