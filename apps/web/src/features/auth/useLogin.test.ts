// Guards the login form's rules (T097): pressing sign in twice sends one request, a successful
// sign-in goes to the agent's home, and a refused one shows the api's message and stays put.
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
  it("signs in once however often it is pressed, then goes to /agent", async () => {
    let finish: (value: unknown) => void = () => {};
    signIn.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useLogin());

    await act(async () => {
      void result.current.submit(demo);
      void result.current.submit(demo);
      finish({ user: {} });
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/agent");
  });

  it("shows the api's message when the sign-in is refused, and stays on the page", async () => {
    signIn.mockRejectedValue(new ApiError(400, { error: "Invalid email or password" }));
    const { result } = renderHook(() => useLogin());

    await act(() => result.current.submit(demo));

    expect(result.current.error).toBe("Invalid email or password");
    expect(replace).not.toHaveBeenCalled();
  });
});
