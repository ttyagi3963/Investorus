// Guards the login form's rules (T097, T300): pressing sign in twice sends one request, a
// successful sign-in goes to the home of the user's role, and a refused one shows the api's
// message and the request ID, and stays put.
import { ApiError } from "@clever/contracts/client";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLogin } from "./useLogin";

const replace = vi.fn();
const signIn = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../../lib/bff-client", () => ({ session: { signIn: (input: unknown) => signIn(input) } }));

const demo = { email: "avery@example.com", password: "demo1234" };

describe("useLogin", () => {
  it("signs in once however often it is pressed, then goes to the home of the user's role", async () => {
    let finish: (value: unknown) => void = () => {};
    signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useLogin());

    await act(async () => {
      void result.current.submit(demo);
      void result.current.submit(demo);
      finish({ user: { role: "AGENT" } });
    });
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith("/agent");

    signIn.mockResolvedValue({ user: { role: "INVESTOR" } });
    const investor = renderHook(() => useLogin());
    await act(() => investor.result.current.submit(demo));
    expect(replace).toHaveBeenLastCalledWith("/investor");
  });

  it("shows the api's message and the request ID when the sign-in is refused, and stays put", async () => {
    signIn.mockRejectedValue(
      new ApiError(400, { error: "Invalid email or password", requestId: "trace-1" }),
    );
    const { result } = renderHook(() => useLogin());

    await act(() => result.current.submit(demo));

    expect(result.current.error).toEqual({
      message: "Invalid email or password",
      requestId: "trace-1",
    });
    expect(replace).not.toHaveBeenCalled();
  });
});
