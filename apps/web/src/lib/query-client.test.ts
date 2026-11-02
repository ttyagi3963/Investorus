// Guards the app's server-state rule (T334): a record the tab remembers is never shown after the api
// says it no longer exists. React Query keeps the last good data when a refetch fails, so a 404
// must reach the error boundary instead.
import { ApiError } from "@clever/contracts/client";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { Component, createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "./query-client";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? createElement("p", null, "error page") : this.props.children;
  }
}

function RememberedPackage() {
  const { data } = useQuery<string>({
    queryKey: ["package", "deleted"],
    queryFn: () => Promise.reject(new ApiError(404, { error: "Package not found" })),
  });
  return createElement("p", null, String(data));
}

describe("createQueryClient", () => {
  afterEach(cleanup);

  it("sends a remembered record's 404 to the error page instead of showing the record", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const client = createQueryClient();
    client.setQueryData(["package", "deleted"], "48 Maple Ave");

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Boundary, null, createElement(RememberedPackage)),
      ),
    );

    expect(await screen.findByText("error page")).toBeTruthy();
    expect(screen.queryByText("48 Maple Ave")).toBeNull();
  });

  it("ends the tab's session on a 401: what it remembers is not shown, and it goes to sign-in once (T418)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const toSignIn = vi.fn();
    const client = createQueryClient(toSignIn);
    // The tab still remembers a list from before its session ended (for example, the data was reset).
    client.setQueryData(["packages"], "12 Old Listing St");
    function RememberedList() {
      const { data } = useQuery<string>({
        queryKey: ["packages"],
        queryFn: () => Promise.reject(new ApiError(401, { error: "Sign in again" })),
      });
      return createElement("p", null, String(data));
    }

    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(Boundary, null, createElement(RememberedList)),
      ),
    );

    expect(await screen.findByText("error page")).toBeTruthy();
    expect(screen.queryByText("12 Old Listing St")).toBeNull();
    expect(toSignIn).toHaveBeenCalledTimes(1);
  });
});
